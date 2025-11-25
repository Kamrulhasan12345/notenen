import { Router } from "express";
import * as noteController from "../controllers/note.controller.js";
import { validate } from "../middlewares/validation.middleware.js"
import { requireAuth } from "../middlewares/auth.middleware.js";
import { createNoteSchema, noteIdSchema, updateNoteSchema, shareNoteSchema } from "../schemas/note.schema.js";

const router = Router();

router.use(requireAuth);

router.post("/", validate(createNoteSchema), noteController.create);
router.get("/", noteController.getAll);
router.get("/:id", validate(noteIdSchema), noteController.getOne);
router.delete("/:id", validate(noteIdSchema), noteController.remove);
router.patch("/:id", validate(updateNoteSchema), noteController.update);
router.post("/:id/share", validate(shareNoteSchema), noteController.share);

export default router;