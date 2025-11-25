import { z } from "zod";

// Reusable ObjectId validation
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format");

export const createNoteSchema = z.object({
  body: z.object({
    title: z.string().min(1).optional(), // Defaults to "Untitled" if missing
  }).strict(),
});

export const updateNoteSchema = z.object({
  params: z.object({
    id: objectId,
  }),
  body: z.object({
    title: z.string().min(1, "Title cannot be empty"),
  }).strict(),
});

export const shareNoteSchema = z.object({
  params: z.object({
    id: objectId,
  }),
  body: z.object({
    targetUserId: objectId,
    role: z.enum(["editor", "viewer"]),
  }).strict(),
});

export const noteIdSchema = z.object({
  params: z.object({
    id: objectId,
  }),
});

// Extract Types
export type CreateNoteInput = z.infer<typeof createNoteSchema>["body"];
export type ShareNoteInput = z.infer<typeof shareNoteSchema>["body"];