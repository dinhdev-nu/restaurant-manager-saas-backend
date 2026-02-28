import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type SessionDocument = HydratedDocument<Session>;

@Schema({ timestamps: true })
export class Session {
  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  userID: Types.ObjectId;

  @Prop({ unique: true })
  sid: string; 

  @Prop()
  refreshTokenHash?: string;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;

  @Prop({ default: 0 })
  version: number;

  @Prop({ default: true })
  isValid: boolean;

  @Prop({ required: true })
  expiredAt: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

SessionSchema.index({ "expiredAt": 1 }, { expireAfterSeconds: 0 });  // TTL index to auto-remove expired sessions