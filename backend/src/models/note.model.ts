import { Schema, model, type InferSchemaType } from "mongoose";

const NoteSchema = new Schema({
  title: { type: String, default: "Untitled" },
  content: { type: String, default: "" },
  contentPreview: { type: String, default: "", select: true },
  documentState: { type: Buffer, default: Buffer.from([]) },

  owner: { type: Schema.Types.ObjectId, ref: "NoteNenUser", required: true },

  members: [
    {
      user: { type: Schema.Types.ObjectId, ref: "NoteNenUser" },
      role: { type: String, enum: ["editor", "viewer"], default: "viewer" }
    }
  ]
}, { timestamps: true });

NoteSchema.pre('save', function (next) {
  if (this.isModified('content')) {
    this.contentPreview = this.content.substring(0, 200);
  }
  next();
});

export type Note = InferSchemaType<typeof NoteSchema>;
export const NoteModel = model<Note>("NoteNenNote", NoteSchema);