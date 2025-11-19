import bcrypt from "bcrypt";
import type { ClientSession } from "mongoose";
import { User, type UserDocument } from "../models/user.model.js";
import {
  issueAccessToken,
  issueRefreshTokenForDevice,
  revokeAllForUser,
  revokeRefreshTokenByJti,
  rotateRefreshToken,
  verifyRefreshTokenSignature
} from "./token.service.js";

export type RegisterOpts = {
  deviceInfo?: string;
  ip?: string;
  session?: ClientSession;
  bcryptRounds?: number;
};

export type AuthResult = {
  user: {
    id: string;
    email: string;
    createdAt?: Date;
  };
  accessToken: string;
  refreshToken: string;
  refreshJti: string;
  refreshExpiresAt: Date;
};

/**
 * registerUser
 *
 * - Creates a new user (hashed password)
 * - Issues access + per-device refresh token (stored by token.service)
 * - Returns minimal user DTO + tokens
 *
 * Throws:
 * - Error with message "EmailExists" when email already registered
 * - Other errors bubble up (DB errors, etc.)
 */
export async function registerUser(
  name: string,
  email: string,
  password: string,
  opts: RegisterOpts = {}
): Promise<AuthResult> {
  const rounds = opts.bcryptRounds ?? 12;

  const normalizedEmail = email.trim().toLowerCase();
  
  const existing = await User.findOne({ email: normalizedEmail }).session(opts.session ?? null);
  if (existing) {
    const err = new Error("EmailExists");
    (err as any).code = "EmailExists";
    throw err;
  }

  // create user with hashed password
  const passwordHash = await bcrypt.hash(password, rounds);

  // Persist new user. Use create to ensure unique index enforcement.
  const created = await User.create(
    [
      {
        name,
        email: normalizedEmail,
        passwordHash,
        tokenVersion: 0
      }
    ],
    { session: opts.session }
  );

  // User.create with array returns array of docs
  const userDoc = created[0] as UserDocument;
  const userId = userDoc.id ?? userDoc._id.toString();

  // Issue access token and per-device refresh token (persisted by token.service)
  const accessToken = issueAccessToken(userId);
  const refreshOpts: { deviceInfo?: string; ip?: string; session?: ClientSession } = {};
  if (opts.deviceInfo !== undefined) refreshOpts.deviceInfo = opts.deviceInfo;
  if (opts.ip !== undefined) refreshOpts.ip = opts.ip;
  if (opts.session !== undefined) refreshOpts.session = opts.session;
  const { token: refreshToken, jti: refreshJti, expiresAt: refreshExpiresAt } =
    await issueRefreshTokenForDevice(userId, refreshOpts);

  return {
    user: {
      id: userId,
      email: userDoc.email,
      createdAt: userDoc.createdAt
    },
    accessToken,
    refreshToken,
    refreshJti,
    refreshExpiresAt
  };
}

/**
 * Login flow: validate credentials, issue tokens and store refresh record
 */
export async function loginUser(email: string, password: string, opts?: { deviceInfo?: string; ip?: string }) {
  const user = await User.findOne({ email });
  if (!user) throw new Error("InvalidCredentials");
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new Error("InvalidCredentials");

  const accessToken = issueAccessToken(user.id ?? user._id.toString());
  const { token: refreshToken, jti, expiresAt } = await issueRefreshTokenForDevice(user.id ?? user._id.toString(), { deviceInfo: opts?.deviceInfo ?? "", ip: opts?.ip ?? "" });

  return { user, accessToken, refreshToken, expiresAt, jti };
}

/**
 * Refresh endpoint: client sends refreshToken; we verify signature and rotate record
 */
export async function refreshTokens(refreshJwt: string, opts?: { deviceInfo?: string; ip?: string }) {
  const payload = verifyRefreshTokenSignature(refreshJwt);
  if (!payload) throw new Error("InvalidRefreshToken");

  // payload.jti must exist
  if (!payload.jti || !payload.sub) throw new Error("InvalidRefreshToken");

  // rotate and return new tokens (rotation function checks DB and marks old revoked)
  const rotated = await rotateRefreshToken(payload.jti, { deviceInfo: opts?.deviceInfo ?? "", ip: opts?.ip ?? "" });
  return rotated; // { accessToken, refreshToken, jti, expiresAt }
}

/**
 * Logout current device: client provides refreshToken (or we parse jti from it)
 */
export async function logout(refreshJwt: string) {
  const payload = verifyRefreshTokenSignature(refreshJwt);
  if (!payload || !payload.jti) return;
  await revokeRefreshTokenByJti(payload.jti);
}

/**
 * Logout all (global): authenticated endpoint
 */
export async function logoutAll(userId: string) {
  await revokeAllForUser(userId);
}