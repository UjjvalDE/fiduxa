// E2E: social login (Google OIDC + Sign in with Apple) for customers.
// Provider token/JWKS endpoints are LOCAL mocks with keys generated here –
// no network calls to Google or Apple.
import { ROOT, prepareEnv, createChecker } from "../helpers/harness.mjs";
prepareEnv("fiduxa_e2e_oauth");
process.env.DISABLE_RATE_LIMIT = "1"; // many round trips from one IP (test-only bypass)

import http from "node:http";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");
const jose = await import(pathToFileURL(require.resolve("jose")).href);

// ---------- Mock identity providers ----------
const googleKey = await jose.generateKeyPair("RS256", { extractable: true });
const appleIdKey = await jose.generateKeyPair("RS256", { extractable: true });
const rogueKey = await jose.generateKeyPair("RS256", { extractable: true });
const appleClientKey = await jose.generateKeyPair("ES256", { extractable: true }); // the owner's .p8 key
const jwk = async (pub, kid) => ({ ...(await jose.exportJWK(pub)), kid, alg: "RS256", use: "sig" });
const googleJwks = { keys: [await jwk(googleKey.publicKey, "g1")] };
const appleJwks = { keys: [await jwk(appleIdKey.publicKey, "a1")] };

// code → { claims, signWith?, kid? } – the token endpoint answers with an id_token built from it
const codes = new Map();
const tokenRequests = [];
const mock = http.createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const send = (status, json) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(json));
  };
  if (req.url === "/google/jwks") return send(200, googleJwks);
  if (req.url === "/apple/jwks") return send(200, appleJwks);
  if (req.method === "POST" && (req.url === "/google/token" || req.url === "/apple/token")) {
    const form = Object.fromEntries(new URLSearchParams(raw));
    tokenRequests.push({ url: req.url, form });
    const entry = codes.get(form.code);
    if (!entry) return send(400, { error: "invalid_grant" });
    codes.delete(form.code);
    const google = req.url === "/google/token";
    const key = entry.signWith ?? (google ? googleKey.privateKey : appleIdKey.privateKey);
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: google ? "https://accounts.google.com" : "https://appleid.apple.com",
      aud: google ? "google-client.apps.test" : "de.fiduxa.test.signin",
      iat: now,
      exp: now + 600,
      ...entry.claims,
    };
    const idToken = await new jose.SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: entry.kid ?? (google ? "g1" : "a1") }).sign(key);
    return send(200, { access_token: "at", token_type: "Bearer", expires_in: 3600, id_token: idToken });
  }
  send(404, { error: "not_found" });
});
await new Promise((r) => mock.listen(0, "127.0.0.1", r));
const mockBase = `http://127.0.0.1:${mock.address().port}`;
process.env.GOOGLE_AUTH_URL = `${mockBase}/google/auth`;
process.env.GOOGLE_TOKEN_URL = `${mockBase}/google/token`;
process.env.GOOGLE_JWKS_URL = `${mockBase}/google/jwks`;
process.env.APPLE_AUTH_URL = `${mockBase}/apple/auth`;
process.env.APPLE_TOKEN_URL = `${mockBase}/apple/token`;
process.env.APPLE_JWKS_URL = `${mockBase}/apple/jwks`;

// ---------- App ----------
const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: AuditLog } = await import(ROOT + "/src/models/audit-log.model.js");
await connectDB();
await User.db.dropDatabase();
for (const M of Object.values(User.db.models)) await M.syncIndexes();
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
process.env.OAUTH_CALLBACK_BASE_URL = `${base}/auth/oauth`;
const SITE = "http://localhost:3000";

const { check, summary } = createChecker();
const call = async (method, p, body, token) => {
  const res = await fetch(base + p, {
    method,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
};
const cookieOf = (headers, name) => headers.getSetCookie().find((c) => c.startsWith(`${name}=`)) ?? null;
const cookieValue = (setCookie) => setCookie?.split(";")[0].split("=").slice(1).join("=") ?? "";
const attrs = (setCookie) =>
  setCookie
    .split(";")
    .slice(1)
    .map((s) => s.trim())
    .filter((s) => !/^expires=/i.test(s))
    .sort()
    .join("; ");

/** Start a login; returns the authorize URL params + flow cookie */
const start = async (provider, query = "") => {
  const res = await fetch(`${base}/auth/oauth/${provider}/start${query}`, { redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  const flow = cookieOf(res.headers, "fiduxa_oauth");
  const url = location.startsWith(mockBase) ? new URL(location) : null;
  return { status: res.status, location, url, params: url?.searchParams, cookie: flow ? flow.split(";")[0] : null };
};
/** Provider → our callback (GET) */
const callback = async (provider, query, cookie) => {
  const res = await fetch(`${base}/auth/oauth/${provider}/callback?${new URLSearchParams(query)}`, {
    redirect: "manual",
    headers: cookie ? { Cookie: cookie } : {},
  });
  return { status: res.status, location: res.headers.get("location") ?? "", session: cookieOf(res.headers, "fiduxa_session"), headers: res.headers };
};
let seq = 0;
/** Full happy-path round trip with the given ID token claims (nonce filled in) */
const googleLogin = async (claims, { query = "", entry = {} } = {}) => {
  const s = await start("google", query);
  const code = `gcode-${++seq}`;
  codes.set(code, { claims: { nonce: s.params?.get("nonce"), ...claims }, ...entry });
  return { start: s, ...(await callback("google", { code, state: s.params?.get("state") }, s.cookie)) };
};
const errorOf = (location) => new URL(location, SITE).searchParams.get("oauth_error");

const pw = await bcrypt.hash("Password12345", 12);

// ---------- Providers endpoint hides unconfigured ones ----------
let r = await call("GET", "/auth/providers");
check("providers: none configured → both false", r.status === 200 && r.body.providers?.google === false && r.body.providers?.apple === false, r.body);
let s = await start("google", "?from=register");
check("start unconfigured provider → error redirect to register page", s.status === 302 && s.location === `${SITE}/registrieren?oauth_error=not_configured`, s.location);

process.env.GOOGLE_CLIENT_ID = "google-client.apps.test";
process.env.GOOGLE_CLIENT_SECRET = "google-secret";
r = await call("GET", "/auth/providers");
check("providers: only Google configured", r.body.providers?.google === true && r.body.providers?.apple === false, r.body);
process.env.APPLE_CLIENT_ID = "de.fiduxa.test.signin";
process.env.APPLE_TEAM_ID = "TEAM123456";
process.env.APPLE_KEY_ID = "KEY1234567";
r = await call("GET", "/auth/providers");
check("providers: Apple still hidden while the private key is missing", r.body.providers?.apple === false, r.body);
// Stored like an .env one-liner with literal \n
process.env.APPLE_PRIVATE_KEY = (await jose.exportPKCS8(appleClientKey.privateKey)).replace(/\n/g, "\\n");
r = await call("GET", "/auth/providers");
check("providers: both configured", r.body.providers?.google === true && r.body.providers?.apple === true, r.body);
check("providers response exposes no secrets", !JSON.stringify(r.body).includes("google-secret") && !JSON.stringify(r.body).includes("TEAM123456"));

// ---------- Google authorize request ----------
s = await start("google", "?next=%2Fbuchung&from=checkout&lang=en");
check("google start → redirect to provider", s.status === 302 && s.url?.pathname === "/google/auth", s.location);
check("google start: client id, redirect uri, scope", s.params?.get("client_id") === "google-client.apps.test" && s.params?.get("redirect_uri") === `${base}/auth/oauth/google/callback` && s.params?.get("scope") === "openid email profile");
check("google start: state + nonce + PKCE S256", s.params?.get("state")?.length >= 40 && s.params?.get("nonce")?.length >= 40 && s.params?.get("code_challenge_method") === "S256" && s.params?.get("code_challenge")?.length === 43);
check("flow cookie HttpOnly, scoped to the oauth path", Boolean(s.cookie) && /HttpOnly/i.test((await fetch(`${base}/auth/oauth/google/start`, { redirect: "manual" })).headers.getSetCookie().join(";")));

// ---------- New customer via Google ----------
let g = await googleLogin({ sub: "g-new-1", email: "Neu.Kunde@Example.com", email_verified: true, name: "Neu Kunde" }, { query: "?next=%2Fbuchung&from=checkout&lang=en" });
check("new google user → redirect to return URL", g.status === 302 && g.location === `${SITE}/buchung`, g.location);
const tokenReq = tokenRequests.at(-1);
check("token request carries the PKCE verifier matching the challenge", tokenReq?.form.code_verifier && createHash("sha256").update(tokenReq.form.code_verifier).digest("base64url") === g.start.params.get("code_challenge"));
check("token request: client secret + redirect uri", tokenReq?.form.client_secret === "google-secret" && tokenReq?.form.redirect_uri === `${base}/auth/oauth/google/callback`);
let created = await User.findOne({ email: "neu.kunde@example.com" }).select("+password");
check("customer created (consumer, verified, no password, language)", created?.role === "consumer" && created.emailVerified === true && !created.password && created.preferredLanguage === "en" && created.name === "Neu Kunde", created);
check("google sub stored", created?.oauth?.googleSub === "g-new-1");
check("audit: oauth_signup", Boolean(await AuditLog.exists({ action: "auth.oauth_signup", entityId: created?._id })));
const oauthToken = cookieValue(g.session);
r = await call("GET", "/auth/me", null, oauthToken);
check("session from social login works for /auth/me", r.status === 200 && r.body.user?.email === "neu.kunde@example.com", r.body);
r = await fetch(`${base}/auth/session`, { headers: { Cookie: `fiduxa_session=${oauthToken}` } }).then((x) => x.json());
check("session cookie recognised by /auth/session", r.authenticated === true && r.user?.role === "consumer", r);

// Session cookie identical to the password login
await call("POST", "/auth/register", { name: "Pass Wort", email: "pass@t.local", password: "Password12345" });
const pwLogin = await call("POST", "/auth/login", { email: "pass@t.local", password: "Password12345" });
const pwCookie = cookieOf(pwLogin.headers, "fiduxa_session");
check("social session cookie has Max-Age=604800 (7 days)", /Max-Age=604800/.test(g.session ?? ""), g.session);
check("social session cookie attributes identical to password login", pwCookie && g.session && attrs(pwCookie) === attrs(g.session), { pw: pwCookie && attrs(pwCookie), oauth: g.session && attrs(g.session) });
const decoded = jose.decodeJwt(oauthToken);
const decodedPw = jose.decodeJwt(cookieValue(pwCookie));
check("social JWT has same claim shape + lifetime as password JWT", Object.keys(decoded).sort().join() === Object.keys(decodedPw).sort().join() && decoded.exp - decoded.iat === 604800, { decoded, decodedPw });
check("flow cookie cleared after callback", /fiduxa_oauth=;/.test(g.headers.getSetCookie().join("\n")));

// Second login with the same sub (email changed at Google) → same account
g = await googleLogin({ sub: "g-new-1", email: "changed@example.com", email_verified: true });
check("repeat login by sub → same user, default return /konto", g.location === `${SITE}/konto` && jose.decodeJwt(cookieValue(g.session)).userId === String(created._id), g.location);
check("audit: oauth_login", Boolean(await AuditLog.exists({ action: "auth.oauth_login", entityId: created._id })));
check("still only one account", (await User.countDocuments({ "oauth.googleSub": "g-new-1" })) === 1);

// ---------- Linking by verified email ----------
const klara = await User.create({ name: "Klara Kunde", email: "klara@t.local", password: pw, role: "consumer" });
g = await googleLogin({ sub: "g-unverified", email: "klara@t.local", email_verified: false });
check("unverified email never links → email_unverified", g.status === 302 && errorOf(g.location) === "email_unverified" && !g.session, g.location);
check("unverified: account untouched", !(await User.findById(klara._id)).oauth?.googleSub);
g = await googleLogin({ sub: "g-unv-new", email: "nobody@t.local", email_verified: "false" });
check("unverified email never creates an account", errorOf(g.location) === "email_unverified" && !(await User.exists({ email: "nobody@t.local" })));

g = await googleLogin({ sub: "g-klara", email: "KLARA@t.local", email_verified: true });
let k = await User.findById(klara._id);
check("verified email links existing customer", g.location === `${SITE}/konto` && k.oauth?.googleSub === "g-klara" && jose.decodeJwt(cookieValue(g.session)).userId === String(klara._id), g.location);
check("linking marks email verified", k.emailVerified === true);
check("audit: oauth_link", Boolean(await AuditLog.exists({ action: "auth.oauth_link", entityId: klara._id })));
r = await call("POST", "/auth/login", { email: "klara@t.local", password: "Password12345" });
check("linked customer keeps password login", r.status === 200 && r.body.user?.id === String(klara._id));
g = await googleLogin({ sub: "g-klara-2", email: "klara@t.local", email_verified: true });
check("second Google identity for an already linked account refused", errorOf(g.location) === "already_linked" && (await User.findById(klara._id)).oauth.googleSub === "g-klara");

// ---------- Never link cleaners / admins ----------
const worker = await User.create({ name: "Anna Worker", email: "anna@t.local", password: pw, role: "worker", workerStatus: "approved", emailVerified: true });
const admin = await User.create({ name: "Admin One", email: "admin@t.local", password: pw, role: "admin" });
g = await googleLogin({ sub: "g-anna", email: "anna@t.local", email_verified: true });
check("worker email → role_not_allowed, no session", errorOf(g.location) === "role_not_allowed" && !g.session, g.location);
check("worker not linked", !(await User.findById(worker._id)).oauth?.googleSub);
g = await googleLogin({ sub: "g-admin", email: "admin@t.local", email_verified: true }, { query: "?from=login&next=%2Fadmin" });
check("admin email → role_not_allowed (back to login with next)", g.location.startsWith(`${SITE}/login?`) && errorOf(g.location) === "role_not_allowed" && new URL(g.location).searchParams.get("next") === "/admin", g.location);
check("admin not linked", !(await User.findById(admin._id)).oauth?.googleSub);
check("audit: refused attempt recorded", Boolean(await AuditLog.exists({ action: "auth.oauth_refused", entityId: admin._id })));
// A sub somehow linked to a worker (e.g. role changed later) is refused too
await User.updateOne({ _id: worker._id }, { $set: { "oauth.googleSub": "g-anna-linked" } });
g = await googleLogin({ sub: "g-anna-linked", email: "anna@t.local", email_verified: true });
check("linked sub on a worker account → role_not_allowed", errorOf(g.location) === "role_not_allowed" && !g.session);

// ---------- State / nonce / token validation ----------
s = await start("google");
codes.set("c-state", { claims: { nonce: s.params.get("nonce"), sub: "g-x", email: "x@t.local", email_verified: true } });
let c = await callback("google", { code: "c-state", state: "wrong-state" }, s.cookie);
check("bad state → invalid_state", errorOf(c.location) === "invalid_state" && !c.session, c.location);
c = await callback("google", { code: "c-state", state: s.params.get("state") }, null);
check("missing flow cookie → invalid_state", errorOf(c.location) === "invalid_state" && !c.session);
const forged = await new jose.SignJWT({ p: "google", state: "s", nonce: "n", cv: "v", next: "/konto" }).setProtectedHeader({ alg: "HS256" }).setAudience("oauth-flow").setExpirationTime("5m").sign(new TextEncoder().encode("not-the-secret"));
c = await callback("google", { code: "c-state", state: "s" }, `fiduxa_oauth=${forged}`);
check("forged flow cookie → invalid_state", errorOf(c.location) === "invalid_state");
const sApple = await start("apple");
c = await callback("google", { code: "c-state", state: sApple.params.get("state") }, sApple.cookie);
check("flow cookie of another provider → invalid_state", errorOf(c.location) === "invalid_state");
c = await callback("google", { error: "access_denied", state: s.params.get("state") }, s.cookie);
check("user cancelled at Google → cancelled", errorOf(c.location) === "cancelled");

g = await googleLogin({ sub: "g-nonce", email: "nonce@t.local", email_verified: true, nonce: "attacker-nonce" });
check("bad nonce → invalid_token", errorOf(g.location) === "invalid_token" && !g.session, g.location);
const past = Math.floor(Date.now() / 1000) - 3600;
g = await googleLogin({ sub: "g-exp", email: "exp@t.local", email_verified: true, iat: past - 600, exp: past });
check("expired ID token → invalid_token", errorOf(g.location) === "invalid_token" && !g.session);
g = await googleLogin({ sub: "g-aud", email: "aud@t.local", email_verified: true, aud: "someone-elses-client" });
check("wrong aud → invalid_token", errorOf(g.location) === "invalid_token" && !g.session);
g = await googleLogin({ sub: "g-iss", email: "iss@t.local", email_verified: true, iss: "https://evil.example" });
check("wrong iss → invalid_token", errorOf(g.location) === "invalid_token");
g = await googleLogin({ sub: "g-sig", email: "sig@t.local", email_verified: true }, { entry: { signWith: rogueKey.privateKey } });
check("signature by an unknown key → invalid_token", errorOf(g.location) === "invalid_token");
check("no accounts created by rejected tokens", !(await User.exists({ email: { $in: ["nonce@t.local", "exp@t.local", "aud@t.local", "iss@t.local", "sig@t.local", "x@t.local"] } })));
s = await start("google");
c = await callback("google", { code: "unknown-code", state: s.params.get("state") }, s.cookie);
check("token exchange failure → token_exchange_failed", errorOf(c.location) === "token_exchange_failed");

// ---------- Return-to validation ----------
for (const bad of ["//evil.example/x", "https://evil.example", "/\\evil.example", "javascript:alert(1)", "%2F%2Fevil.example"]) {
  g = await googleLogin({ sub: "g-new-1", email: "neu.kunde@example.com", email_verified: true }, { query: `?next=${encodeURIComponent(bad)}` });
  check(`return-to "${bad}" falls back to /konto`, g.location === `${SITE}/konto`, g.location);
}
g = await googleLogin({ sub: "g-new-1", email: "neu.kunde@example.com", email_verified: true }, { query: `?next=${encodeURIComponent("/konto/buchungen?tab=past")}` });
check("relative return-to with query kept", g.location === `${SITE}/konto/buchungen?tab=past`, g.location);

// ---------- Sign in with Apple ----------
s = await start("apple", "?lang=pl");
check("apple start: form_post, scope name email, nonce", s.url?.pathname === "/apple/auth" && s.params.get("response_mode") === "form_post" && s.params.get("scope") === "name email" && s.params.get("nonce")?.length >= 40 && s.params.get("redirect_uri") === `${base}/auth/oauth/apple/callback`);
codes.set("a-1", { claims: { nonce: s.params.get("nonce"), sub: "apple-001", email: "abc123@privaterelay.appleid.com", email_verified: "true", is_private_email: "true" } });
// Apple posts the form cross-site (no cookie) …
let post = await fetch(`${base}/auth/oauth/apple/callback`, {
  method: "POST",
  redirect: "manual",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ code: "a-1", state: s.params.get("state"), user: JSON.stringify({ name: { firstName: "Zofia", lastName: "Kowalska" }, email: "abc123@privaterelay.appleid.com" }) }),
});
const bounce = new URL(post.headers.get("location") ?? "", `${base}/auth/oauth/apple/callback`);
check("apple form_post → 303 to the same-site GET callback", post.status === 303 && bounce.pathname === "/api/v1/auth/oauth/apple/callback" && bounce.searchParams.get("code") === "a-1", post.headers.get("location"));
check("form_post does not log in by itself", !cookieOf(post.headers, "fiduxa_session"));
c = await callback("apple", Object.fromEntries(bounce.searchParams), s.cookie);
check("apple first login → redirect /konto with session", c.location === `${SITE}/konto` && /Max-Age=604800/.test(c.session ?? ""), c.location);
let zofia = await User.findOne({ "oauth.appleSub": "apple-001" });
check("apple first login stores the name sent once", zofia?.name === "Zofia Kowalska" && zofia.preferredLanguage === "pl", zofia);
check("private relay email accepted and flagged", zofia?.email === "abc123@privaterelay.appleid.com" && zofia.oauth.applePrivateEmail === true);
const appleReq = tokenRequests.filter((t) => t.url === "/apple/token").at(-1);
let secretOk = false;
try {
  const { payload, protectedHeader } = await jose.jwtVerify(appleReq.form.client_secret, appleClientKey.publicKey, { issuer: "TEAM123456", audience: "https://appleid.apple.com", subject: "de.fiduxa.test.signin" });
  secretOk = protectedHeader.alg === "ES256" && protectedHeader.kid === "KEY1234567" && payload.exp - payload.iat <= 3600;
} catch (e) {
  secretOk = false;
}
check("apple client_secret is an ES256 JWT (team/key/services id)", secretOk);
s = await start("apple");
codes.set("a-2", { claims: { nonce: s.params.get("nonce"), sub: "apple-001", email: "abc123@privaterelay.appleid.com", email_verified: true } });
c = await callback("apple", { code: "a-2", state: s.params.get("state") }, s.cookie);
zofia = await User.findById(zofia._id);
check("apple repeat login (no name sent) keeps the stored name", c.location === `${SITE}/konto` && zofia.name === "Zofia Kowalska");
s = await start("apple");
codes.set("a-3", { claims: { nonce: s.params.get("nonce"), sub: "apple-002", email: "q9@privaterelay.appleid.com", email_verified: true, is_private_email: true } });
c = await callback("apple", { code: "a-3", state: s.params.get("state") }, s.cookie);
const noName = await User.findOne({ "oauth.appleSub": "apple-002" });
check("apple without name + relay email → neutral default name", noName?.name === "Fiduxa Kunde", noName?.name);
s = await start("apple");
codes.set("a-4", { claims: { nonce: s.params.get("nonce"), sub: "apple-003", email: "x@t.local", email_verified: true, aud: "google-client.apps.test" } });
c = await callback("apple", { code: "a-4", state: s.params.get("state") }, s.cookie);
check("apple wrong aud → invalid_token", errorOf(c.location) === "invalid_token");
post = await fetch(`${base}/auth/oauth/apple/callback`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ error: "user_cancelled_authorize", state: s.params.get("state") }) });
s = await start("apple");
c = await callback("apple", { error: "user_cancelled_authorize", state: s.params.get("state") }, s.cookie);
check("apple cancel → cancelled", post.status === 303 && errorOf(c.location) === "cancelled");

// ---------- Social-only accounts: password login, reset, GDPR ----------
r = await call("POST", "/auth/login", { email: "neu.kunde@example.com", password: "whatever123" });
check("password login for social-only account → 401 (no crash)", r.status === 401, r);
r = await call("PATCH", "/users/me/password", { currentPassword: "x", newPassword: "NewPassword123" }, oauthToken);
check("change password without one → NO_PASSWORD_SET", r.status === 400 && r.body.code === "NO_PASSWORD_SET", r.body);
r = await call("GET", "/users/me/export", null, oauthToken);
check("GDPR export works and lists linked logins", r.status === 200 && r.body.profile?.linkedLogins?.google && r.body.profile.linkedLogins.apple === null && !JSON.stringify(r.body).includes("g-new-1"), r.body.profile);
const resetToken = "reset-token-for-oauth-user-123456";
await User.updateOne({ _id: created._id }, { $set: { passwordResetTokenHash: createHash("sha256").update(resetToken).digest("hex"), passwordResetExpires: new Date(Date.now() + 600_000) } });
r = await call("POST", "/auth/forgot-password", { email: "neu.kunde@example.com" });
check("forgot password accepted for social-only account", r.status === 200);
await User.updateOne({ _id: created._id }, { $set: { passwordResetTokenHash: createHash("sha256").update(resetToken).digest("hex"), passwordResetExpires: new Date(Date.now() + 600_000) } });
r = await call("POST", "/auth/reset-password", { token: resetToken, password: "FirstPassword123" });
check("reset sets a first password", r.status === 200, r.body);
r = await call("POST", "/auth/login", { email: "neu.kunde@example.com", password: "FirstPassword123" });
check("then password login works", r.status === 200 && r.body.user?.id === String(created._id));
g = await googleLogin({ sub: "g-new-1", email: "neu.kunde@example.com", email_verified: true });
check("Google login still works after setting a password", g.location === `${SITE}/konto` && Boolean(g.session));

// Deletion of a social-only account (Apple user, no password): confirm with email
s = await start("apple");
codes.set("a-5", { claims: { nonce: s.params.get("nonce"), sub: "apple-001", email: "abc123@privaterelay.appleid.com", email_verified: true } });
c = await callback("apple", { code: "a-5", state: s.params.get("state") }, s.cookie);
const zToken = cookieValue(c.session);
r = await call("DELETE", "/users/me", { password: "guess" }, zToken);
check("delete social-only account needs email confirmation", r.status === 400 && r.body.code === "CONFIRM_EMAIL_REQUIRED", r.body);
r = await call("DELETE", "/users/me", { confirmEmail: "ABC123@privaterelay.appleid.com" }, zToken);
check("delete social-only account with email confirmation", r.status === 200, r.body);
const gone = await User.findById(zofia._id);
check("deleted account anonymised and unlinked", gone.anonymisedAt && !gone.oauth?.appleSub && gone.isActive === false);
s = await start("apple");
codes.set("a-6", { claims: { nonce: s.params.get("nonce"), sub: "apple-001", email: "abc123@privaterelay.appleid.com", email_verified: true } });
c = await callback("apple", { code: "a-6", state: s.params.get("state") }, s.cookie);
const fresh = await User.findOne({ "oauth.appleSub": "apple-001" });
check("signing in again after deletion starts a fresh account", c.location === `${SITE}/konto` && fresh && String(fresh._id) !== String(zofia._id));
r = await call("DELETE", "/users/me", { password: "Password12345" }, pwLogin.body.token);
check("password accounts still delete with the password", r.status === 200, r.body);

// ---------- Done ----------
const { failures, passes } = summary();
console.log(`\n${failures ? "FAILED" : "OK"}: ${passes} passed, ${failures} failed`);
await User.db.dropDatabase();
await User.db.close();
server.close();
mock.close();
process.exit(failures ? 1 : 0);
