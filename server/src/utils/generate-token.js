import jwt from "jsonwebtoken";

// Accepts a user document (preferred) or a user ID string.
// The token carries the user's tokenVersion so password changes can
// invalidate every previously issued token.
// Options (package E, sliding sessions): `expiresIn` (seconds or "7d") and
// `abs` – absolute expiry (unix seconds) that a renewal may never exceed.
const generateToken = (userOrId, { expiresIn, abs } = {}) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  const payload =
    typeof userOrId === "object" && userOrId !== null
      ? {
          userId: userOrId._id.toString(),
          tv: userOrId.tokenVersion ?? 0,
          // Role hint only (maintenance mode lets admins through without a DB
          // lookup); every protected route still re-checks the user in the DB.
          ...(userOrId.role && { role: userOrId.role }),
        }
      : { userId: String(userOrId), tv: 0 };
  if (abs) payload.abs = abs;

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: expiresIn ?? process.env.JWT_EXPIRES_IN ?? "1d",
  });
};

export default generateToken;
