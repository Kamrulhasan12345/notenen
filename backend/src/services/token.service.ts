import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import type { ClientSession } from "mongoose";
import { RefreshToken } from "../models/refreshToken.model.js";
import { User } from "../models/user.model.js";
import { env, durationToMs, /* or durationStringToSeconds if you use it */ } from "../config/env.js";

/**
 * JWT payload types
 */
export type AccessPayload = { sub: string; iat?: number; exp?: number; };
export type RefreshPayload = { sub: string; jti: string; iat?: number; exp?: number; tv?: number; };

/**
 * Issue access token (short lived)
 */
export function issueAccessToken(userId: string) {
  const payload = { sub: userId };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: durationToMs(env.TOKEN_EXPIRES_IN) });
}

/**
 * Create refresh token record + signed JWT (per-device)
 * Returns { token, jti }
 */
export async function issueRefreshTokenForDevice(userId: string, opts?: { deviceInfo?: string; ip?: string; session?: ClientSession }) {
  const jti = uuidv4();
  const now = new Date();
  // compute expiresAt as Date
  const expiresAt = new Date(Date.now() + durationToMs(env.REFRESH_EXPIRES_IN));

  // persist record
  await RefreshToken.create([{
    jti,
    userId,
    deviceInfo: opts?.deviceInfo,
    issuedAt: now,
    expiresAt,
    revoked: false,
    ip: opts?.ip ?? null
  }], { session: opts?.session });

  const payload: RefreshPayload = { sub: userId, jti };
  const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: durationToMs(env.REFRESH_EXPIRES_IN) });
  return { token, jti, expiresAt };
}

/**
 * Verify access token (returns payload or null)
 */
export function verifyAccessToken(token: string): AccessPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as AccessPayload;
  } catch {
    return null;
  }
}

/**
 * Verify refresh token signature only (returns payload) — no DB checks here
 */
export function verifyRefreshTokenSignature(token: string): RefreshPayload | null {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
  } catch {
    return null;
  }
}

/**
 * Rotate a refresh token: consume the old jti, create a new one, return new tokens.
 * Ensures atomicity if you pass a Mongoose session.
 */
export async function rotateRefreshToken(oldJti: string, opts?: { deviceInfo?: string; ip?: string; session?: ClientSession }) {
  // find active token record
  const rec = await RefreshToken.findOne({ jti: oldJti }).session(opts?.session ?? null);
  if (!rec || rec.revoked) throw new Error("InvalidRefreshToken");

  // Ensure token not expired
  if (rec.expiresAt.getTime() <= Date.now()) {
    // mark as revoked for safety
    rec.revoked = true;
    await rec.save();
    throw new Error("RefreshTokenExpired");
  }

  // Create new jti and persist new record; mark old replacedBy + revoked
  const newJti = uuidv4();
  const now = new Date();
  const newExpires = new Date(Date.now() + durationToMs(env.REFRESH_EXPIRES_IN));

  // Use transaction-aware writes if available
  rec.revoked = true;
  rec.replacedBy = newJti;
  rec.lastUsedAt = now;
  await rec.save({ session: opts?.session ?? null });

  await RefreshToken.create([{
    jti: newJti,
    userId: rec.userId,
    deviceInfo: opts?.deviceInfo ?? rec.deviceInfo,
    issuedAt: now,
    lastUsedAt: now,
    expiresAt: newExpires,
    revoked: false,
    ip: opts?.ip ?? rec.ip ?? null
  }], { session: opts?.session });

  // new refresh token string
  const newRefreshJwt = jwt.sign({ sub: rec.userId.toString(), jti: newJti }, env.JWT_REFRESH_SECRET, { expiresIn: durationToMs(env.REFRESH_EXPIRES_IN) });
  const newAccessJwt = jwt.sign({ sub: rec.userId.toString() }, env.JWT_SECRET, { expiresIn: durationToMs(env.TOKEN_EXPIRES_IN) });

  return {
    accessToken: newAccessJwt,
    refreshToken: newRefreshJwt,
    jti: newJti,
    expiresAt: newExpires
  };
}

/**
 * Revoke a single refresh token by jti
 */
export async function revokeRefreshTokenByJti(jti: string) {
  await RefreshToken.updateOne({ jti }, { $set: { revoked: true } });
}

/**
 * Revoke all refresh tokens for a user (per-device plus bump tokenVersion as global kill)
 */
export async function revokeAllForUser(userId: string) {
  await RefreshToken.updateMany({ userId }, { $set: { revoked: true } });
  await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });
}

/**
 * Helper to convert refresh-expires into cookie options if you want to set httpOnly cookie
 */
export function createRefreshCookieOptions() {
  const maxAgeMs = durationToMs(env.REFRESH_EXPIRES_IN);
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/api/auth/refresh",
    maxAge: Math.floor(maxAgeMs)
  };
}
