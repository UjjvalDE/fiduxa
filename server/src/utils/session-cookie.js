// Session cookie carrying the JWT. HttpOnly + SameSite=Lax keeps the
// token out of JavaScript (no localStorage) and blocks cross-site sends; the
// Authorization header keeps working in parallel (API clients, tests).
// Default lifetime 24 h; sliding sessions pass the token's own lifetime.
const COOKIE_NAME = "fiduxa_session";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // matches JWT_EXPIRES_IN (1d)

const options = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
});

export const setSessionCookie = (res, token, maxAgeMs = MAX_AGE_MS) => {
  res.cookie(COOKIE_NAME, token, { ...options(), maxAge: maxAgeMs });
};

export const clearSessionCookie = (res) => {
  res.clearCookie(COOKIE_NAME, options());
};

export const SESSION_COOKIE_NAME = COOKIE_NAME;
