import { Schema, model, Types, type InferSchemaType } from "mongoose";

const RefreshTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'NoteNenUser', required: true },
  jti: { type: String, required: true, unique: true },
  revoked: { type: Boolean, default: false },
  replacedBy: { type: String, default: null }, // Points to the new JTI if rotated
  expiresAt: { type: Date, required: true },
  deviceInfo: { type: String, default: "Unknown" },
  ip: { type: String, default: null },
}, { timestamps: true });

RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshToken = InferSchemaType<typeof RefreshTokenSchema>;
export const RefreshTokenModel = model('NoteNenRefreshToken', RefreshTokenSchema);
export default RefreshTokenModel;