import type { Request, Response } from "express";
import * as authService from "../services/auth.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { env } from "../config/env.js";
import type { LoginInput, RegisterInput, TokenInput } from "../schemas/auth.schema.js";

// Determine if we are in a strict production environment or dev/codespace
const isProduction = env.NODE_ENV === "production";

const getCookieOptions = () => ({
  httpOnly: true,
  // Codespaces requires 'secure: true' because it is HTTPS.
  // In Production, it is also HTTPS.
  // Only false if testing on http://localhost without SSL.
  secure: true,

  // CRITICAL FOR CODESPACES:
  // 'Strict' blocks cookies if frontend/backend domains differ (common in Codespaces).
  // 'None' allows cross-site cookies (requires secure: true).
  sameSite: isProduction ? "strict" as const : "none" as const,

  maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
  path: "/"
});

const getMeta = (req: Request) => ({
  ip: req.ip || (req.headers['x-forwarded-for'] as string) || "",
  deviceInfo: (req.headers["x-device-info"] as string) || (req.headers["user-agent"] as string) || "Unknown"
});

export const login = asyncHandler(async (req: Request<{}, {}, LoginInput>, res: Response) => {
  const { email, password } = req.body;
  // Check if client is Mobile (you will set this header in your RN ApiClient)
  const isMobile = req.headers["x-client-platform"] === "mobile";

  const result = await authService.loginUser(email, password, getMeta(req));

  // 1. WEB STRATEGY: Set HttpOnly Cookie
  if (!isMobile) {
    res.cookie("refreshToken", result.refreshToken, getCookieOptions());
  }

  // 2. RESPONSE
  res.status(200).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      // If Mobile: Send Refresh Token in JSON. 
      // If Web: Send null/undefined (so client logic knows it's in a cookie) OR send it anyway but warn not to use it.
      // Best practice: Only send in JSON for mobile.
      refreshToken: isMobile ? result.refreshToken : undefined,
      refreshExpiresAt: result.refreshExpiresAt
    }
  });
});

export const register = asyncHandler(async (req: Request<{}, {}, RegisterInput>, res: Response) => {
  const { name, email, password } = req.body;
  const isMobile = req.headers["x-client-platform"] === "mobile";

  const result = await authService.registerUser(name, email, password, getMeta(req));

  if (!isMobile) {
    res.cookie("refreshToken", result.refreshToken, getCookieOptions());
  }

  res.status(201).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: isMobile ? result.refreshToken : undefined,
      refreshExpiresAt: result.refreshExpiresAt
    }
  });
});

export const refresh = asyncHandler(async (req: Request<{}, {}, TokenInput>, res: Response) => {
  // 1. Try getting token from Cookie (Web) OR Body (Mobile)
  const incomingToken = req.cookies?.refreshToken || req.body.refreshToken;

  if (!incomingToken) return res.status(401).json({ error: "Missing Refresh Token" });

  const isMobile = req.headers["x-client-platform"] === "mobile";

  try {
    const result = await authService.refreshTokens(incomingToken, getMeta(req));

    // Rotate Cookie for Web
    if (!isMobile) {
      res.cookie("refreshToken", result.refreshToken, getCookieOptions());
    }

    res.status(200).json({
      success: true,
      data: {
        accessToken: result.accessToken,
        refreshToken: isMobile ? result.refreshToken : undefined,
        expiresAt: result.expiresAt
      }
    });
  } catch (err) {
    // Clear cookie on error (Web)
    if (!isMobile) res.clearCookie("refreshToken");
    return res.status(403).json({ error: "Invalid session" });
  }
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const incomingToken = req.cookies?.refreshToken || req.body.refreshToken;
  const isMobile = req.headers["x-client-platform"] === "mobile";

  if (incomingToken) {
    await authService.logout(incomingToken);
  }

  // Clear Cookie (Web)
  if (!isMobile) {
    res.clearCookie("refreshToken");
  }

  res.status(200).json({ success: true, message: "Logged out" });
});

// POST /auth/logout-all (Protected Route)
export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  // 'req.user' is populated by your authentication middleware
  const userId = (req as any).user?.id;

  if (!userId) return res.status(401).json({ error: "Unauthenticated" });

  await authService.logoutAll(userId);
  res.status(200).json({ success: true, message: "All sessions terminated" });
});