import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

export type UserDocument = User & Document;

const PROVIDER = ["local", "google", "facebook"];

@Schema({ timestamps: true })
export class User {

    // INFO
    @Prop({ required: true, unique: true, trim: true, minLength: 5, maxLength: 20 })
    user_name?: string;

    // Account
    @Prop({ required: true, unique: true, trim: true, lowercase: true })
    email: string;

    @Prop({ unique: true, trim: true, sparse: true })
    phone?: string;

    @Prop()
    password?: string;

    @Prop()
    salt?: string;

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ default: false })
    isVerified: boolean;

    @Prop({ type: [String], default: ["customer"] })
    roles: string[];

    @Prop({ enum: PROVIDER, default: "local" })
    provider: string;

    @Prop()
    providerId?: string;

    @Prop({ type: Types.ObjectId, ref: "Restaurant", default: null })
    restaurant?: Types.ObjectId;

}


export const UserSchema = SchemaFactory.createForClass(User);