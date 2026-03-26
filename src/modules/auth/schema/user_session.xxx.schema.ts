import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from './user.xxx.schema';

export type UserSessionDocument = HydratedDocument<UserSession>;

export class DeviceInfo {
  @Prop({ type: String, default: null })
  browser: string | null;

  @Prop({ type: String, default: null })
  os: string | null;

  @Prop({ type: String, default: null })
  device: string | null;

  @Prop({ type: String, default: null })
  user_agent: string | null;
}

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
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  user_id: Types.ObjectId;

  @Prop({ type: String, required: true, unique: true, select: false })
  token_hash: string;

  @Prop({ type: DeviceInfo, default: null })
  device_info: DeviceInfo | null;

  @Prop({ type: String, default: null, maxlength: 45 })
  ip_address: string | null;

  @Prop({ type: Date, required: true })
  expires_at: Date;

  @Prop({ type: Boolean, default: false })
  is_revoked: boolean;

  @Prop({ type: Boolean, default: false })
  remember_me: boolean;

  created_at: Date;
}

export const UserSessionSchema = SchemaFactory.createForClass(UserSession);

UserSessionSchema.index({ user_id: 1, is_revoked: 1 });
UserSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

UserSessionSchema.virtual('is_active').get(function (
  this: UserSessionDocument,
) {
  return !this.is_revoked && this.expires_at > new Date();
});