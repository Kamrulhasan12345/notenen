import  { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface IRefreshToken {
  jti: string;
  userId: Types.ObjectId;
  deviceInfo?: string;
  issuedAt: Date;
  lastUsedAt?: Date;
  expiresAt: Date;
  revoked: boolean;
  replacedBy?: string | null;
  ip?: string | null;
}

export type RefreshTokenDocument = HydratedDocument<IRefreshToken>;

const RefreshTokenSchema = new Schema<IRefreshToken>({
  jti: { type: String, required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'NoteNenUser', required: true, index: true },
  deviceInfo: {type: String},
  issuedAt: { type: Date, required: true },
  lastUsedAt: { type: Date },
  expiresAt: { type: Date, required: true, index: true },
  revoked: { type: Boolean, default: false },
  replacedBy: { type: String, default: null },
  ip: { type: String, default: null }
});

RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model<IRefreshToken>('NoteNenRefreshToken', RefreshTokenSchema);

export default RefreshToken;