// Social login for CUSTOMERS: Google (OpenID Connect, authorization code +
// PKCE + state + nonce) and Sign in with Apple (form_post, ES256 client
// secret). Configuration comes from the environment only; a provider whose
// variables are missing is reported as disabled and its routes answer with an
// error redirect. Provider endpoints may only be overridden in NODE_ENV=test
// (local mocks in the e2e suite) so production always talks to the real IdPs.
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from "jose";

import { getSiteUrl } from "../utils/site-url.js";

const env = (key) => (process.env[key] ?? "").trim();
const testOverride = (key, fallback) => (process.env.NODE_ENV === "test" && env(key)) || fallback;

export const PROVIDERS = ["google", "apple"];

const GOOGLE = {
  authUrl: () => testOverride("GOOGLE_AUTH_URL", "https://accounts.google.com/o/oauth2/v2/auth"),
  tokenUrl: () => testOverride("GOOGLE_TOKEN_URL", "https://oauth2.googleapis.com/token"),
  jwksUrl: () => testOverride("GOOGLE_JWKS_URL", "https://www.googleapis.com/oauth2/v3/certs"),
  issuers: ["https://accounts.google.com", "accounts.google.com"],
};

const APPLE = {
  authUrl: () => testOverride("APPLE_AUTH_URL", "https://appleid.apple.com/auth/authorize"),
  tokenUrl: () => testOverride("APPLE_TOKEN_URL", "https://appleid.apple.com/auth/token"),
  jwksUrl: () => testOverride("APPLE_JWKS_URL", "https://appleid.apple.com/auth/keys"),
  issuer: "https://appleid.apple.com",
};

export const isConfigured = (provider) => {
  if (provider === "google") return Boolean(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
  if (provider === "apple") {
    return Boolean(env("APPLE_CLIENT_ID") && env("APPLE_TEAM_ID") && env("APPLE_KEY_ID") && env("APPLE_PRIVATE_KEY"));
  }
  return false;
};

export const configuredProviders = () => Object.fromEntries(PROVIDERS.map((p) => [p, isConfigured(p)]));

/**
 * Public base of the callback URLs, e.g. https://fiduxa.de/api/v1/auth/oauth
 * → https://fiduxa.de/api/v1/auth/oauth/google/callback. Defaults to the
 * website origin (the Next.js proxy forwards /api/v1 to the API).
 */
export const callbackBase = () => (env("OAUTH_CALLBACK_BASE_URL") || `${getSiteUrl()}/api/v1/auth/oauth`).replace(/\/$/, "");
export const callbackUrl = (provider) => `${callbackBase()}/${provider}/callback`;

const b64url = (buf) => Buffer.from(buf).toString("base64url");
export const randomToken = () => b64url(randomBytes(32));
export const pkceChallenge = (verifier) => b64url(createHash("sha256").update(verifier).digest());

/** Provider authorization URL for a new login attempt */
export const authorizationUrl = (provider, { state, nonce, codeVerifier }) => {
  if (provider === "google") {
    const url = new URL(GOOGLE.authUrl());
    url.search = new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      redirect_uri: callbackUrl("google"),
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: pkceChallenge(codeVerifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return url.toString();
  }
  const url = new URL(APPLE.authUrl());
  url.search = new URLSearchParams({
    client_id: env("APPLE_CLIENT_ID"),
    redirect_uri: callbackUrl("apple"),
    response_type: "code",
    response_mode: "form_post",
    scope: "name email",
    state,
    nonce,
  }).toString();
  return url.toString();
};

/** Apple's client_secret: a short-lived ES256 JWT signed with the .p8 key */
export const appleClientSecret = async () => {
  const pem = env("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const key = await importPKCS8(pem, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env("APPLE_KEY_ID") })
    .setIssuer(env("APPLE_TEAM_ID"))
    .setSubject(env("APPLE_CLIENT_ID"))
    .setAudience(APPLE.issuer)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
};

export class OAuthError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

/** Exchange the authorization code for tokens; returns the raw id_token */
const exchangeCode = async (provider, { code, codeVerifier }) => {
  const body =
    provider === "google"
      ? new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: callbackUrl("google"),
          client_id: env("GOOGLE_CLIENT_ID"),
          client_secret: env("GOOGLE_CLIENT_SECRET"),
          code_verifier: codeVerifier,
        })
      : new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: callbackUrl("apple"),
          client_id: env("APPLE_CLIENT_ID"),
          client_secret: await appleClientSecret(),
        });
  let res;
  try {
    res = await fetch(provider === "google" ? GOOGLE.tokenUrl() : APPLE.tokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new OAuthError("provider_unavailable", "Token endpoint not reachable");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || typeof json.id_token !== "string") throw new OAuthError("token_exchange_failed", json.error || `HTTP ${res.status}`);
  return json.id_token;
};

// Remote key sets are cached per URL by jose (also handles key rotation)
const jwksCache = new Map();
const jwks = (url) => {
  if (!jwksCache.has(url)) jwksCache.set(url, createRemoteJWKSet(new URL(url)));
  return jwksCache.get(url);
};

const truthy = (v) => v === true || v === "true";

/** Verify signature (provider JWKS), iss, aud, exp and nonce; normalise the claims */
export const verifyIdToken = async (provider, idToken, { nonce }) => {
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, jwks(provider === "google" ? GOOGLE.jwksUrl() : APPLE.jwksUrl()), {
      issuer: provider === "google" ? GOOGLE.issuers : APPLE.issuer,
      audience: provider === "google" ? env("GOOGLE_CLIENT_ID") : env("APPLE_CLIENT_ID"),
      algorithms: ["RS256", "ES256"],
      clockTolerance: 60,
    }));
  } catch (error) {
    throw new OAuthError("invalid_token", error.code || error.message);
  }
  // Apple only echoes the nonce when one was sent (always, here)
  if (!payload.nonce || payload.nonce !== nonce) throw new OAuthError("invalid_token", "nonce mismatch");
  if (!payload.sub) throw new OAuthError("invalid_token", "sub missing");
  return {
    sub: String(payload.sub),
    email: typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null,
    emailVerified: truthy(payload.email_verified),
    privateEmail: truthy(payload.is_private_email),
    name: typeof payload.name === "string" ? payload.name : null,
  };
};

/** Full code → verified identity step */
export const completeLogin = async (provider, { code, codeVerifier, nonce }) => {
  const idToken = await exchangeCode(provider, { code, codeVerifier });
  return verifyIdToken(provider, idToken, { nonce });
};
