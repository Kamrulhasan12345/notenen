import { Schema, model, type InferSchemaType } from "mongoose";

const UserSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  tokenVersion: { type: Number, default: 0 }, 
}, { timestamps: true });

export type User = InferSchemaType<typeof UserSchema>;
export const UserModel = model('NoteNenUser', UserSchema);
export default UserModel;