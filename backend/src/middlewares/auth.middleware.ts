import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1]!;

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };

    (req as any).user = { id: payload.sub };

    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or Expired Token" });
  }
};