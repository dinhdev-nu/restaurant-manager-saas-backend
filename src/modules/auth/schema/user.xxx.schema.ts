import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

// ─── Nested types ────────────────────────────────────────────
@Schema({ _id: false })
export class UserNotificationPreferences {
  @Prop({ type: Boolean, default: true })
  email: boolean;

  @Prop({ type: Boolean, default: true })
  sms: boolean;

  @Prop({ type: Boolean, default: true })
  push: boolean;
}

@Schema({ _id: false })
export class UserPreferences {
  @Prop({ type: String, default: 'vi' })
  language: string;

  @Prop({ type: String, enum: ['light', 'dark', 'system'], default: 'light' })
  theme: string;

  @Prop({ type: UserNotificationPreferences, default: () => ({}) })
  notifications: UserNotificationPreferences;
}

// ─── Main schema ─────────────────────────────────────────────
@Schema({
  collection: 'users',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: any) => {
      delete ret.__v;
      delete ret.password_hash;
      delete ret.two_factor_secret;
      return ret;
    },
  },
})
export class User {
  // ── Identity ──────────────────────────────────────────────
  @Prop({
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  })
  email: string;

  @Prop({ type: String, default: null, trim: true })
  phone: string | null;

  /** NULL nếu chỉ dùng OAuth */
  @Prop({ type: String, default: null, select: false })
  password_hash: string | null;

  @Prop({ type: String, required: true, trim: true, maxlength: 150 })
  full_name: string;

  @Prop({ type: String, default: null })
  avatar_url: string | null;

  @Prop({ type: Date, default: null })
  date_of_birth: Date | null;

  @Prop({ type: String, enum: ['male', 'female', 'other'], default: null })
  gender: 'male' | 'female' | 'other' | null;

  // ── Platform role ─────────────────────────────────────────
  /**
   * admin : team vận hành, toàn quyền hệ thống
   * user       : người dùng thông thường (chủ nhà hàng, khách đặt online)
   * guest      : không lưu DB — xử lý ở middleware
   */
  @Prop({
    type: String,
    enum: ['admin', 'user'],
    default: 'user',
    index: true,
  })
  system_role: 'admin' | 'user';

  // ── Status ────────────────────────────────────────────────
  @Prop({
    type: String,
    enum: ['active', 'inactive', 'banned', 'pending'],
    default: 'active',
    index: true,
  })
  status: 'active' | 'inactive' | 'banned' | 'pending';

  // ── Verification ──────────────────────────────────────────
  @Prop({ type: Date, default: null })
  email_verified_at: Date | null;

  @Prop({ type: Date, default: null })
  phone_verified_at: Date | null;

  // ── Login tracking ────────────────────────────────────────
  @Prop({ type: Date, default: null })
  last_login_at: Date | null;

  /** IPv4 or IPv6 */
  @Prop({ type: String, default: null, maxlength: 45 })
  last_login_ip: string | null;

  // ── 2FA ───────────────────────────────────────────────────
  @Prop({ type: Boolean, default: false })
  two_factor_enabled: boolean;

  // ── Preferences & metadata ────────────────────────────────
  /** {"language":"vi","theme":"dark","notifications":{}} */
  @Prop({ type: UserPreferences, default: () => ({}) })
  preferences: UserPreferences;

  // ── Soft delete ───────────────────────────────────────────
  @Prop({ type: Date, default: null, index: true })
  deleted_at: Date | null;

  // ── Auto-timestamps (injected by `timestamps` option) ─────
  created_at: Date;
  updated_at: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// ─── Indexes ─────────────────────────────────────────────────
UserSchema.index({ phone: 1 }, { sparse: true });
UserSchema.index({ deleted_at: 1, status: 1 }); // compound — soft-delete queries

// ─── Virtual: isVerified ─────────────────────────────────────
UserSchema.virtual('is_email_verified').get(function (this: UserDocument) {
  return this.email_verified_at !== null;
});
UserSchema.virtual('is_phone_verified').get(function (this: UserDocument) {
  return this.phone_verified_at !== null;
});