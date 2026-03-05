import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { Role, ROLE, ROLE_LIST } from "src/common/constants/role.constant";

export type UserDocument = HydratedDocument<User>;
;
const PROVIDER = ["local", "google", "facebook"];

@Schema()
export class Provider {
    @Prop({ enum: PROVIDER, default: "local" })
    name: string;
    @Prop()
    providerId: string;
}

@Schema({ timestamps: true })
export class User {

    // INFO
    @Prop({ required: true, unique: true, trim: true, minLength: 5, maxLength: 20 })
    user_name?: string;

    @Prop()
    avatar?: string;

    // Account
    @Prop({ unique: true, trim: true, lowercase: true })
    email?: string;

    @Prop({ unique: true, trim: true, sparse: true })
    phone?: string;

    @Prop()
    password?: string;

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ type: String, enum: ROLE_LIST, default: ROLE.USER })
    role: Role;

    @Prop({ type: [Provider], default: [{ name: "local", providerId: "" }] })
    providers: Provider[];
}



export const UserSchema = SchemaFactory.createForClass(User);