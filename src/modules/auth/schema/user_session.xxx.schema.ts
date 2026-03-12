import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from './user.xxx.schema';

export type UserSessionDocument = HydratedDocument<UserSession>;

// ─── Nested type ─────────────────────────────────────────────
export class DeviceInfo {
  @Prop({ type: String, default: null })
  browser: string | null;

  @Prop({ type: String, default: null })
  os: string | null;

  /** e.g. "Desktop" | "Mobile" | "Tablet" */
  @Prop({ type: String, default: null })
  device: string | null;

  @Prop({ type: String, default: null })
  user_agent: string | null;
}

// ─── Main schema ─────────────────────────────────────────────
@Schema({
  collection: 'user_sessions',
  timestamps: { createdAt: 'created_at', updatedAt: false },
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: any) => {
      delete ret.__v;
      delete ret.token_hash;
      return ret;
    },
  },
})
export class UserSession {
  // ── Relation ──────────────────────────────────────────────
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  user_id: Types.ObjectId;

  // ── Token ─────────────────────────────────────────────────
  /** SHA-256 của refresh token — không lưu token gốc */
  @Prop({ type: String, required: true, unique: true, select: false })
  token_hash: string;

  // ── Client info ───────────────────────────────────────────
  /** {"browser":"Chrome 120","os":"macOS","device":"Desktop"} */
  @Prop({ type: DeviceInfo, default: null })
  device_info: DeviceInfo | null;

  /** IPv4 or IPv6 */
  @Prop({ type: String, default: null, maxlength: 45 })
  ip_address: string | null;

  // ── Lifecycle ─────────────────────────────────────────────
  @Prop({ type: Date, required: true, index: true })
  expires_at: Date;

  @Prop({ type: Boolean, default: false })
  is_revoked: boolean;

  /**
   * Phân biệt TTL:
   *   remember_me = false → hết hạn 24h
   *   remember_me = true  → hết hạn 30 ngày
   */
  @Prop({ type: Boolean, default: false })
  remember_me: boolean;

  // ── Auto-timestamp ────────────────────────────────────────
  created_at: Date;
}

export const UserSessionSchema = SchemaFactory.createForClass(UserSession);

// ─── Indexes ─────────────────────────────────────────────────
UserSessionSchema.index({ user_id: 1, is_revoked: 1 });
UserSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 }); // MongoDB TTL — tự dọn session hết hạn

// ─── Virtual: isActive ────────────────────────────────────────
UserSessionSchema.virtual('is_active').get(function (
  this: UserSessionDocument,
) {
  return !this.is_revoked && this.expires_at > new Date();
});