import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import { registerSchema, loginSchema, tokenSchema } from "../schemas/auth.schema.js";

const router = Router();

// Apply validation middleware before the controller
router.post("/register", validate(registerSchema), authController.register);
router.post("/login", validate(loginSchema), authController.login);
router.post("/refresh", validate(tokenSchema), authController.refresh);
router.post("/logout", validate(tokenSchema), authController.logout);

// No validation body needed for logout-all (it uses headers/user context)
router.post("/logout-all", authController.logoutAll);

export default router;