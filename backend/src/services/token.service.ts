import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { RefreshTokenModel } from "../models/refreshToken.model.js";
import { UserModel } from "../models/user.model.js";
import { env, getExpiryDate } from "../config/env.js";

// Types
type AccessPayload = { sub: string }; // 'sub' is standard for User ID
type RefreshPayload = { sub: string; jti: string };
type TokenMeta = { ip: string; deviceInfo: string };

/**
 * Issue a short-lived Access Token (Stateless)
 */
export const signAccessToken = (userId: string) => {
  return jwt.sign(
    { sub: userId } as AccessPayload,
    env.JWT_SECRET,
    { expiresIn: env.TOKEN_EXPIRES_IN }
  );
};

/**
 * Issue a long-lived Refresh Token (Stateful)
 * Creates a DB record and returns the signed JWT.
 */
export const signRefreshToken = async (userId: string, meta: TokenMeta) => {
  const jti = uuidv4();
  const expiresAt = getExpiryDate(env.REFRESH_EXPIRES_IN);

  await RefreshTokenModel.create({
    userId,
    jti,
    expiresAt,
    ip: meta.ip,
    deviceInfo: meta.deviceInfo,
  });

  const token = jwt.sign(
    { sub: userId, jti } as RefreshPayload,
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.REFRESH_EXPIRES_IN }
  );

  return { token, jti, expiresAt };
};

/**
 * Verify Refresh Token and Decode
 */
export const verifyRefreshToken = (token: string): RefreshPayload => {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
  } catch (error) {
    throw new Error("Invalid or Expired Token");
  }
};

/**
 * Refresh Token Rotation with Reuse Detection
 */
export const rotateRefreshToken = async (incomingToken: string, meta: TokenMeta) => {
  const payload = verifyRefreshToken(incomingToken);

  const oldToken = await RefreshTokenModel.findOne({ jti: payload.jti });

  // 1. REUSE DETECTION: If token doesn't exist or was already revoked/replaced
  if (!oldToken || oldToken.revoked) {
    await RefreshTokenModel.updateMany({ userId: payload.sub }, { revoked: true });
    throw new Error("Security Alert: Token reuse detected. All sessions terminated.");
  }

  // 2. Create NEW Token
  const { token: newRefreshToken, jti: newJti, expiresAt } = await signRefreshToken(payload.sub, meta);

  // 3. Invalidate OLD Token and link to NEW Token
  oldToken.revoked = true;
  oldToken.replacedBy = newJti;
  await oldToken.save();

  // 4. Issue new Access Token
  const newAccessToken = signAccessToken(payload.sub);

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresAt
  };
};

/**
 * Revoke a specific token (Logout)
 */
export const revokeToken = async (jti: string) => {
  await RefreshTokenModel.updateOne({ jti }, { revoked: true });
};

/**
 * Revoke all tokens for a user (Global Logout)
 */
export const revokeAllForUser = async (userId: string) => {
  // 1. Mark all refresh tokens as revoked
  await RefreshTokenModel.updateMany({ userId }, { revoked: true });

  // 2. Increment tokenVersion on User (invalidates all stateless Access Tokens instantly)
  await UserModel.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });
};
