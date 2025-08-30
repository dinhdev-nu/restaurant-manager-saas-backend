import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

export type MenuItemDocument = MenuItem & Document;

@Schema({ timestamps: true })
export class MenuItem {

    @Prop({ type: Types.ObjectId, ref: "Restaurant" })
    restaurantId: Types.ObjectId;

    @Prop({ required: true })
    name: string;

    @Prop()
    description?: string;

    @Prop({ required: true })
    price: number;

    @Prop()
    imageUrl?: string;

    @Prop({ enum: ["food", "drink", "other"], required: true })
    category: string;

    @Prop({ default: true })
    isAvailable: boolean;

}

export const MenuItemSchema = SchemaFactory.createForClass(MenuItem);