import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";


export type RoleDocument = Role & Document;


@Schema({ timestamps: true })
export class Role {

    @Prop({ required: true, unique: true })
    name: string;

    @Prop()
    description: string;

    @Prop({ type: [String], default: [] })
    permissions: string[];

}

export const RoleSchema = SchemaFactory.createForClass(Role);