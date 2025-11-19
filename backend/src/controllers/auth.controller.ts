import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from 'jsonwebtoken'
import User from "../models/user.model.js";
import * as authService from "../services/auth.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * POST /auth/register
 * Expects req.body to contain { email, password }
 * Validation should run before this controller (Zod/validate middleware)
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password } = req.body as { name: string; email: string; password: string };

  try {
    const result = await authService.registerUser(name, email, password, {
      deviceInfo: String(req.headers["user-agent"] ?? ""),
      ip: req.ip ?? ""
    });

    return res.status(201).json({
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        refreshExpiresAt: result.refreshExpiresAt
      }
    });
  } catch (err: any) {
    if (err?.code === "EmailExists" || err?.message === "EmailExists") {
      return res.status(409).json({ error: "EmailExists", message: "Email is already registered" });
    }

    // Handle Mongo duplicate key race that results in a MongoError
    if (err?.code === 11000) {
      return res.status(409).json({ error: "EmailExists", message: "Email is already registered" });
    }

    throw err;
  }
});

// POST /auth/login
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  const result = await authService.loginUser(email, password, {
    deviceInfo: String(req.headers["user-agent"] ?? ""),
    ip: req.ip ?? ""
  });

  return res.status(200).json({
    data: {
      user: { id: result.user.id, email: result.user.email },
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      refreshExpiresAt: result.expiresAt
    }
  });
});

// POST /auth/refresh
// Client sends { refreshToken } in body
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) return res.status(400).json({ error: "MissingRefreshToken" });

  const rotated = await authService.refreshTokens(refreshToken, {
    deviceInfo: String(req.headers["user-agent"] ?? ""),
    ip: req.ip ?? ""
  });

  return res.status(200).json({
    data: {
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      refreshExpiresAt: rotated.expiresAt
    }
  });
});

// POST /auth/logout
// Client sends { refreshToken } or uses authenticated access token to identify session
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) return res.status(400).json({ error: "MissingRefreshToken" });

  await authService.logout(refreshToken);
  // Client must delete tokens locally
  return res.status(200).json({ data: { message: "Logged out" } });
});

// POST /auth/logout-all
// Protected endpoint: caller must be authenticated (use requireAuth middleware to set req.user.id)
export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthenticated" });

  await authService.logoutAll(userId);
  return res.status(200).json({ data: { message: "All sessions logged out" } });
});

// /*
//  Optional session management endpoints (requires session.service implementation)
//  - GET /auth/sessions
//  - DELETE /auth/sessions/:jti
// */

// // GET /auth/sessions
// export const sessions = asyncHandler(async (req: Request, res: Response) => {
//   const userId = (req as any).user?.id as string | undefined;
//   if (!userId) return res.status(401).json({ error: "Unauthenticated" });

//   const rows = await listSessions(userId);
//   return res.status(200).json({ data: rows });
// });

// // DELETE /auth/sessions/:jti
// export const revokeSession = asyncHandler(async (req: Request, res: Response) => {
//   const userId = (req as any).user?.id as string | undefined;
//   const { jti } = req.params as { jti: string };
//   if (!userId) return res.status(401).json({ error: "Unauthenticated" });

//   // optional safety: verify the jti belongs to the user in session.service
//   await authService.logout(jti, userId);
//   return res.status(200).json({ data: { message: "Session revoked" } });
// });