import bcrypt from "bcrypt";
import { UserModel } from "../models/user.model.js";
import * as TokenService from "./token.service.js";

type AuthMeta = { ip: string; deviceInfo: string };

export async function registerUser(name: string, email: string, pass: string, meta: AuthMeta) {
  // 1. Check existence
  const exists = await UserModel.exists({ email: email.toLowerCase().trim() });
  if (exists) throw new Error("EmailExists");

  // 2. Hash Password
  const passwordHash = await bcrypt.hash(pass, 12);

  // 3. Create User
  const user = await UserModel.create({
    name,
    email: email.toLowerCase().trim(),
    passwordHash
  });

  // 4. Auto-Login: Issue Tokens
  const userId = user._id.toString();
  const accessToken = TokenService.signAccessToken(userId);
  const { token: refreshToken, expiresAt } = await TokenService.signRefreshToken(userId, meta);

  return {
    user: { id: userId, email: user.email, name: user.name },
    accessToken,
    refreshToken,
    refreshExpiresAt: expiresAt
  };
}

export async function loginUser(email: string, pass: string, meta: AuthMeta) {
  // 1. Find User
  const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
  if (!user) throw new Error("InvalidCredentials");

  // 2. Verify Password
  const isValid = await bcrypt.compare(pass, user.passwordHash);
  if (!isValid) throw new Error("InvalidCredentials");

  // 3. Issue Tokens
  const userId = user._id.toString();
  const accessToken = TokenService.signAccessToken(userId);
  const { token: refreshToken, expiresAt } = await TokenService.signRefreshToken(userId, meta);

  return {
    user: { id: userId, email: user.email, name: user.name },
    accessToken,
    refreshToken,
    refreshExpiresAt: expiresAt
  };
}

export async function refreshTokens(token: string, meta: AuthMeta) {
  // Calls the rotation logic in TokenService
  return TokenService.rotateRefreshToken(token, meta);
}

export async function logout(token: string) {
  // try {
  const payload = TokenService.verifyRefreshToken(token);
  await TokenService.revokeToken(payload.jti);
  // } catch (e) {
  //   // Ignore errors during logout (e.g., token already invalid)
  //   // We don't want to block the user from "logging out" on the client side
  // }
}

export const logoutAll = TokenService.revokeAllForUser;