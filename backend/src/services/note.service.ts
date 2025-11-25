import createError from "http-errors";
import { NoteModel } from "../models/note.model.js";

// Helper: Standardized Access Check
export const checkPermission = (note: any, userId: string, level: 'read' | 'write' | 'manage') => {
  const uid = userId.toString();
  const isOwner = note.owner.toString() === uid;
  const member = note.members.find((m: any) => m.user.toString() === uid);

  if (isOwner) return true;
  if (!member) return false;

  if (level === 'read') return true; // Editors and Viewers can read
  if (level === 'write') return member.role === 'editor';

  return false; // Only Owner can manage
};

/**
 * CREATE a new empty note
 */
export async function createNote(userId: string, title?: string) {
  const note = await NoteModel.create({
    owner: userId,
    title: title || "Untitled",
    content: "",
    documentState: Buffer.from([]), // Initialize empty binary state
    members: []
  });

  const obj = note.toObject() as any;
  delete obj.documentState;
  return obj;
}

/**
 * LIST all notes accessible to user
 */
export async function getNotes(userId: string) {
  return NoteModel.find({
    $or: [
      { owner: userId },
      { "members.user": userId }
    ]
  })
    .select("title content updatedAt owner members") // Exclude heavy 'documentState'
    .sort({ updatedAt: -1 })
    .populate("owner", "name email");
}

/**
 * GET single note details
 */
export async function getNoteById(noteId: string, userId: string) {
  const note = await NoteModel.findById(noteId).populate("owner", "name email");

  if (!note) throw createError(404, "Note not found");

  if (!checkPermission(note, userId, 'read')) {
    throw createError(403, "You do not have access to this note");
  }

  // We return the full note including 'documentState' so the client can init Yjs
  return note;
}

/**
 * UPDATE Metadata (Title only)
 * Content updates happen via Socket/Yjs, not here.
 */
export async function updateNoteTitle(noteId: string, userId: string, title: string) {
  const note = await NoteModel.findById(noteId);
  if (!note) throw createError(404, "Note not found");

  if (!checkPermission(note, userId, 'write')) {
    throw createError(403, "Read-only access");
  }

  note.title = title;
  await note.save();
  return note;
}

/**
 * DELETE Note
 */
export async function deleteNote(noteId: string, userId: string) {
  const note = await NoteModel.findById(noteId);
  if (!note) throw createError(404, "Note not found");

  // STRICT: Only Owner can delete
  if (note.owner.toString() !== userId) {
    throw createError(403, "Only the owner can delete this note");
  }

  await note.deleteOne();
  return { message: "Note deleted" };
}

/**
 * SHARE Note (Add Member)
 */
export async function inviteUser(noteId: string, ownerId: string, targetUserId: string, role: 'viewer' | 'editor') {
  const note = await NoteModel.findById(noteId);
  if (!note) throw createError(404, "Note not found");

  if (!checkPermission(note, ownerId, 'manage')) {
    throw createError(403, "Only the owner can manage members");
  }

  // Remove if already exists to prevent duplicates
  note.members = note.members.filter((m: any) => m.user.toString() !== targetUserId) as any;

  // Add new role
  note.members.push({ user: targetUserId as any, role });

  await note.save();
  return note;
}