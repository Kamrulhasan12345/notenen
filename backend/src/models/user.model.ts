import mongoose, { Model, Schema, Document, type HydratedDocument } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUser>;

const UserSchema: Schema<IUser> = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  tokenVersion: { type: Number, default: 0 },
}, { timestamps: true });

export const User: Model<IUser> = mongoose.model<IUser>('NoteNenUser', UserSchema);

export default User;