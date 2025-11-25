import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as noteService from "../services/note.service.js";

// POST /api/notes
export const create = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const note = await noteService.createNote(userId, req.body.title);
  res.status(201).json({ success: true, data: note });
});

// GET /api/notes
export const getAll = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const notes = await noteService.getNotes(userId);
  res.status(200).json({ success: true, data: notes });
});

// GET /api/notes/:id
export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const note = await noteService.getNoteById(req.params.id!, userId);
  res.status(200).json({ success: true, data: note });
});

// PATCH /api/notes/:id
export const update = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  // Currently only supports title updates via REST
  const note = await noteService.updateNoteTitle(req.params.id!, userId, req.body.title);
  res.status(200).json({ success: true, data: note });
});

// DELETE /api/notes/:id
export const remove = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  await noteService.deleteNote(req.params.id!, userId);
  res.status(200).json({ success: true, message: "Note deleted" });
});

// POST /api/notes/:id/share
export const share = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { targetUserId, role } = req.body; // Expect { targetUserId: "...", role: "editor" }

  const note = await noteService.inviteUser(req.params.id!, userId, targetUserId, role);
  res.status(200).json({ success: true, data: note });
});