import jwt from "jsonwebtoken";

// Accepts a user document (preferred) or a user ID string.
// The token carries the user's tokenVersion so password changes can
// invalidate every previously issued token.
const generateToken = (userOrId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  const payload =
    typeof userOrId === "object" && userOrId !== null
      ? { userId: userOrId._id.toString(), tv: userOrId.tokenVersion ?? 0 }
      : { userId: String(userOrId), tv: 0 };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });
};

export default generateToken;
