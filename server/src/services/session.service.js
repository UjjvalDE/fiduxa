// Session lifetimes (package E): admins get an absolute 24 h session that is
// never extended; customers and cleaners get a 7-day sliding session that is
// renewed whenever less than one day remains. Values come from SECURITY
// (admin-configurable). Renewed tokens are sent as a fresh cookie AND in the
// `x-session-token` response header so bearer-header clients keep working.
import generateToken from "../utils/generate-token.js";
import { setSessionCookie } from "../utils/session-cookie.js";
import { SECURITY } from "../config/pricing.js";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/** Renew a customer/cleaner session when less than this many seconds remain */
export const RENEW_BELOW_SECONDS = DAY;

const lifetimeSeconds = (role) => (role === "admin" ? SECURITY.adminSessionHours * HOUR : SECURITY.customerSessionDays * DAY);

/** Token + cookie for a fresh login. Admin tokens carry `abs` (absolute cap). */
export const issueSession = (res, user) => {
  const now = Math.floor(Date.now() / 1000);
  const seconds = lifetimeSeconds(user.role);
  const token = generateToken(user, {
    expiresIn: seconds,
    ...(user.role === "admin" && { abs: now + seconds }),
  });
  setSessionCookie(res, token, seconds * 1000);
  return token;
};

/**
 * Sliding renewal after a successful auth check. Returns the new token or null.
 * - admin: never beyond `abs` (defaults to iat + adminSessionHours); once the
 *   absolute cap is reached the caller gets `{ expired: true }`.
 * - others: fresh customerSessionDays when < RENEW_BELOW_SECONDS remain.
 */
export const maybeRenewSession = (res, user, decoded) => {
  const now = Math.floor(Date.now() / 1000);
  const exp = decoded.exp ?? now;
  if (user.role === "admin") {
    const abs = decoded.abs ?? (decoded.iat ?? now) + SECURITY.adminSessionHours * HOUR;
    if (now >= abs) return { expired: true, token: null };
    const remaining = exp - now;
    const newExp = Math.min(now + SECURITY.adminSessionHours * HOUR, abs);
    if (remaining >= RENEW_BELOW_SECONDS || newExp <= exp) return { expired: false, token: null };
    const token = generateToken(user, { expiresIn: newExp - now, abs });
    attach(res, token, (newExp - now) * 1000);
    return { expired: false, token };
  }
  if (exp - now >= RENEW_BELOW_SECONDS) return { expired: false, token: null };
  const seconds = SECURITY.customerSessionDays * DAY;
  const token = generateToken(user, { expiresIn: seconds });
  attach(res, token, seconds * 1000);
  return { expired: false, token };
};

const attach = (res, token, maxAgeMs) => {
  setSessionCookie(res, token, maxAgeMs);
  res.setHeader("x-session-token", token);
  // Browsers only expose listed headers to fetch() on cross-origin responses
  res.append("Access-Control-Expose-Headers", "x-session-token");
};
