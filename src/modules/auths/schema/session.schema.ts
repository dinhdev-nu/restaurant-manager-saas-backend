import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

export type SessionDocument = Session & Document;

@Schema({ timestamps: true })
export class Session {

    @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
    userID: Types.ObjectId;

    @Prop({ unique: true })
    refreshToken?: string;

    @Prop()
    ip?: string;

    @Prop({ default: 0 })
    version: number;

    @Prop( { default: true } )
    isValid: boolean;

    @Prop({ required: true, expires: 0 })
    expiredAt: Date;

}


export const SessionSchema = SchemaFactory.createForClass(Session);