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
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  user_id: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['google', 'facebook', 'apple', 'zalo'] satisfies OAuthProviderName[],
    required: true,
  })
  provider: OAuthProviderName;

  @Prop({ type: String, required: true, maxlength: 255 })
  provider_user_id: string;

  created_at: Date;
}

export const OAuthProviderSchema = SchemaFactory.createForClass(OAuthProvider);

OAuthProviderSchema.index(
  { provider: 1, provider_user_id: 1 },
  { unique: true },
);