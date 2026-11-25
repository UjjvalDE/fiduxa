// Social login (Google / Apple) for customers. Ends in exactly the same
// session as the password login (issueSession → fiduxa_session cookie with the
// 7-day sliding lifetime). Cleaners and admins can never sign in this way.
//
//   GET  /auth/providers                        → { google: bool, apple: bool }
//   GET  /auth/oauth/:provider/start?next=/konto&from=login|register|checkout&lang=de
//   GET  /auth/oauth/google/callback            (code, state)
//   POST /auth/oauth/apple/callback             (Apple form_post → 303 to GET)
//   GET  /auth/oauth/apple/callback             (code, state, user)
import { timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";

import User from "../models/user.model.js";
import { recordAudit } from "../services/audit.service.js";
import { issueSession } from "../services/session.service.js";
import {
  OAuthError,
  PROVIDERS,
  authorizationUrl,
  completeLogin,
  configuredProviders,
  isConfigured,
  randomToken,
} from "../services/oauth.service.js";
import { getSiteUrl } from "../utils/site-url.js";
import { grantWelcomeOffer } from "./auth.controller.js";

const FLOW_COOKIE = "fiduxa_oauth";
const FLOW_PATH = "/api/v1/auth/oauth";
const FLOW_SECONDS = 10 * 60;
const DEFAULT_NEXT = "/konto";
const ORIGINS = { login: "/login", register: "/registrieren" };
export const COMPLETE_PROFILE_PATH = "/konto/profil-vervollstaendigen";

/** Same-origin relative paths only ("/konto?x=1"); everything else → null */
export const safeReturnTo = (value) => {
  if (typeof value !== "string" || value.length > 500) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value, "http://same.invalid");
    if (url.origin !== "http://same.invalid") return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

const flowCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: FLOW_PATH,
});

const site = () => getSiteUrl();

/** Where to send the browser on failure (page the login started from) */
const errorRedirect = (res, code, flow) => {
  const from = flow?.from;
  const next = flow?.next ?? null;
  let target;
  if (from === "checkout" && next) {
    const url = new URL(next, "http://same.invalid");
    url.searchParams.set("oauth_error", code);
    target = `${url.pathname}${url.search}`;
  } else {
    const params = new URLSearchParams({ oauth_error: code });
    if (next && next !== DEFAULT_NEXT) params.set("next", next);
    target = `${ORIGINS[from] ?? "/login"}?${params}`;
  }
  return res.redirect(302, `${site()}${target}`);
};

const equal = (a, b) => {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
};

const readFlow = (req, provider) => {
  const raw = req.cookies?.[FLOW_COOKIE];
  if (!raw) return null;
  try {
    const flow = jwt.verify(raw, process.env.JWT_SECRET, { algorithms: ["HS256"], audience: "oauth-flow" });
    return flow.p === provider ? flow : null;
  } catch {
    return null;
  }
};

// GET /auth/providers
export const getProviders = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json({ success: true, providers: configuredProviders() });
};

// GET /auth/oauth/:provider/start
export const startOAuth = (req, res) => {
  const { provider } = req.params;
  const from = ["login", "register", "checkout"].includes(req.query.from) ? req.query.from : "login";
  const next = safeReturnTo(req.query.next) ?? DEFAULT_NEXT;
  const lang = ["de", "en", "pl"].includes(req.query.lang) ? req.query.lang : "de";
  if (!PROVIDERS.includes(provider) || !isConfigured(provider)) return errorRedirect(res, "not_configured", { from, next });

  const flow = { p: provider, state: randomToken(), nonce: randomToken(), cv: randomToken(), next, from, lang };
  const signed = jwt.sign(flow, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: FLOW_SECONDS, audience: "oauth-flow" });
  res.cookie(FLOW_COOKIE, signed, { ...flowCookieOptions(), maxAge: FLOW_SECONDS * 1000 });
  res.setHeader("Cache-Control", "no-store");
  return res.redirect(302, authorizationUrl(provider, { state: flow.state, nonce: flow.nonce, codeVerifier: flow.cv }));
};

// POST /auth/oauth/apple/callback – Apple posts cross-site, so the SameSite=Lax
// flow cookie is not sent. Bounce to a same-site GET (top-level navigation,
// cookie included) where state is checked.
export const appleFormPost = (req, res) => {
  const params = new URLSearchParams();
  for (const key of ["code", "state", "user", "error"]) {
    const value = req.body?.[key];
    if (typeof value === "string" && value.length <= 4000) params.set(key, value);
  }
  // Relative to /…/auth/oauth/apple/callback → same URL as GET
  return res.redirect(303, `callback?${params}`);
};

/** Display name for a new account (Apple sends it only on the first login) */
const displayName = (identity, appleUser) => {
  let name = identity.name;
  if (appleUser?.name) name = [appleUser.name.firstName, appleUser.name.lastName].filter(Boolean).join(" ");
  if (!name || name.trim().length < 2) {
    const local = identity.email?.split("@")[0]?.replace(/[._+-]+/g, " ").trim();
    name = identity.privateEmail || !local || local.length < 2 ? "Fiduxa Kunde" : local;
  }
  return name.trim().slice(0, 100);
};

/**
 * Find or create the customer for a verified provider identity.
 * Order: provider sub → verified email of an existing CUSTOMER → new customer.
 */
const resolveCustomer = async (provider, identity, { appleUser, lang }) => {
  const field = provider === "google" ? "googleSub" : "appleSub";
  const linkedAtField = provider === "google" ? "googleLinkedAt" : "appleLinkedAt";

  const linked = await User.findOne({ [`oauth.${field}`]: identity.sub });
  if (linked) {
    if (linked.role !== "consumer") throw Object.assign(new OAuthError("role_not_allowed"), { userId: linked._id });
    if (!linked.isActive) throw new OAuthError("inactive");
    return { user: linked, action: "auth.oauth_login" };
  }

  if (!identity.email || !identity.emailVerified) throw new OAuthError("email_unverified");

  const existing = await User.findOne({ email: identity.email });
  if (existing) {
    if (existing.role !== "consumer") throw Object.assign(new OAuthError("role_not_allowed"), { userId: existing._id });
    if (!existing.isActive || existing.anonymisedAt) throw new OAuthError("inactive");
    if (existing.oauth?.[field]) throw new OAuthError("already_linked");
    existing.set(`oauth.${field}`, identity.sub);
    existing.set(`oauth.${linkedAtField}`, new Date());
    if (provider === "apple" && identity.privateEmail) existing.set("oauth.applePrivateEmail", true);
    const firstVerification = !existing.emailVerified;
    if (firstVerification) {
      existing.emailVerified = true;
      existing.emailVerifiedAt = new Date();
    }
    await existing.save();
    if (firstVerification) await grantWelcomeOffer(existing);
    return { user: existing, action: "auth.oauth_link" };
  }

  let user;
  try {
    user = await User.create({
      name: displayName(identity, appleUser),
      email: identity.email,
      role: "consumer",
      preferredLanguage: lang,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      // Phone, address and AGB/Datenschutz consent still missing
      profileCompletionRequired: true,
      oauth: {
        [field]: identity.sub,
        [linkedAtField]: new Date(),
        ...(provider === "apple" && identity.privateEmail && { applePrivateEmail: true }),
      },
    });
  } catch (error) {
    // Parallel callback for the same identity/email
    if (error.code === 11000) throw new OAuthError("try_again");
    throw error;
  }
  await grantWelcomeOffer(user);
  return { user, action: "auth.oauth_signup" };
};

const parseAppleUser = (raw) => {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

// GET /auth/oauth/:provider/callback
export const oauthCallback = async (req, res) => {
  const { provider } = req.params;
  const flow = readFlow(req, provider);
  res.clearCookie(FLOW_COOKIE, flowCookieOptions());
  res.setHeader("Cache-Control", "no-store");

  if (!PROVIDERS.includes(provider) || !isConfigured(provider)) return errorRedirect(res, "not_configured", flow);
  if (!flow || !equal(req.query.state, flow.state)) return errorRedirect(res, "invalid_state", flow);
  if (req.query.error) return errorRedirect(res, "cancelled", flow);
  if (typeof req.query.code !== "string" || !req.query.code) return errorRedirect(res, "invalid_state", flow);

  try {
    const identity = await completeLogin(provider, { code: req.query.code, codeVerifier: flow.cv, nonce: flow.nonce });
    const appleUser = provider === "apple" ? parseAppleUser(req.query.user) : null;
    const { user, action } = await resolveCustomer(provider, identity, { appleUser, lang: flow.lang });

    issueSession(res, user);
    await recordAudit({
      actor: user._id,
      action,
      entityType: "User",
      entityId: user._id,
      after: { provider, ...(identity.privateEmail && { privateRelayEmail: true }) },
    });
    // New social accounts first complete phone/address/consents, then continue
    const target = user.profileCompletionRequired ? `${COMPLETE_PROFILE_PATH}?${new URLSearchParams({ next: flow.next })}` : flow.next;
    return res.redirect(302, `${site()}${target}`);
  } catch (error) {
    if (error instanceof OAuthError) {
      if (error.code === "role_not_allowed" && error.userId) {
        // Someone tried to sign in to a cleaner/admin account via social login
        await recordAudit({ actor: null, action: "auth.oauth_refused", entityType: "User", entityId: error.userId, after: { provider, reason: error.code } });
      }
      return errorRedirect(res, error.code, flow);
    }
    console.error("OAuth login error:", error);
    return errorRedirect(res, "failed", flow);
  }
};
