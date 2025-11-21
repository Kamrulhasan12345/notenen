import { z } from "zod";

/**
 * Reusable Field Rules
 */
const emailRule = z.email("Invalid email address").trim().toLowerCase();
const passwordRule = z.string().min(8, "Password must be at least 8 characters");
const nameRule = z.string().min(2, "Name must be at least 2 characters").trim();

/**
 * 1. Register Schema
 */
export const registerSchema = z.object({
  body: z.object({
    name: nameRule,
    email: emailRule,
    password: passwordRule,
  }).strict(),
});

export type RegisterInput = z.infer<typeof registerSchema>["body"];


/**
 * 2. Login Schema
 */
export const loginSchema = z.object({
  body: z.object({
    email: emailRule,
    password: z.string().min(1, "Password is required"),
  }).strict(),
});

export type LoginInput = z.infer<typeof loginSchema>["body"];


/**
 * 3. Refresh & Logout Schema
 */
export const tokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, "Refresh token is required"),
  }).strict(),
});

export type TokenInput = z.infer<typeof tokenSchema>["body"];