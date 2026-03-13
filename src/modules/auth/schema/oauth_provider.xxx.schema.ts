import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from './user.xxx.schema';

export type OAuthProviderDocument = HydratedDocument<OAuthProvider>;

export type OAuthProviderName = 'google' | 'facebook' | 'apple' | 'zalo';

@Schema({
  collection: 'oauth_providers',
  timestamps: { createdAt: 'created_at', updatedAt: false },
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: any) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class OAuthProvider {
  // ── Relation ──────────────────────────────────────────────
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  user_id: Types.ObjectId;

  // ── Provider identity ─────────────────────────────────────
  @Prop({
    type: String,
    enum: ['google', 'facebook', 'apple', 'zalo'] satisfies OAuthProviderName[],
    required: true,
  })
  provider: OAuthProviderName;

  /**
   * ID của user bên phía provider — dùng để nhận ra lần đăng nhập sau.
   *
   * Kết hợp (provider + provider_user_id) là unique key.
   *
   * NOTE: Platform không lưu access_token / refresh_token của provider.
   * Flow: OAuth callback → lấy profile 1 lần → tạo session qua user_sessions → xong.
   * Nếu sau này cần tích hợp sâu → tách collection oauth_integrations riêng.
   */
  @Prop({ type: String, required: true, maxlength: 255 })
  provider_user_id: string;

  // ── Auto-timestamp ────────────────────────────────────────
  created_at: Date;
}

export const OAuthProviderSchema = SchemaFactory.createForClass(OAuthProvider);

// ─── Indexes ─────────────────────────────────────────────────
/** Tương đương UNIQUE KEY uq_oauth_provider_uid (provider, provider_user_id) */
OAuthProviderSchema.index(
  { provider: 1, provider_user_id: 1 },
  { unique: true },
);