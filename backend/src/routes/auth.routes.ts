import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import { requireAuth } from "../middlewares/auth.middleware.js"; // <--- Import
import { registerSchema, loginSchema, tokenSchema } from "../schemas/auth.schema.js";

const router = Router();

router.post("/register", validate(registerSchema), authController.register);
router.post("/login", validate(loginSchema), authController.login);
router.post("/refresh", validate(tokenSchema), authController.refresh);
router.post("/logout", validate(tokenSchema), authController.logout);

router.post("/logout-all", requireAuth, authController.logoutAll);

export default router;