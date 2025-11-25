import { Schema, model, type InferSchemaType } from "mongoose";

const NoteUpdateSchema = new Schema({
  noteId: { type: Schema.Types.ObjectId, ref: 'NoteNenNote', required: true, index: true },
  sender: { type: Schema.Types.ObjectId, ref: 'NoteNenUser', required: true },
  updateBlob: { type: Buffer, required: true },
  createdAt: { type: Date, default: Date.now }
});

export type NoteUpdate = InferSchemaType<typeof NoteUpdateSchema>;
export const NoteUpdateModel = model<NoteUpdate>("NoteNenUpdate", NoteUpdateSchema);