import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type MenuItemDocument = HydratedDocument<MenuItem>;

export enum ITEMSTATUS {
    AVAILABLE = "available",
    UNAVAILABLE = "unavailable",
}

@Schema({ timestamps: true })
export class MenuItem {

    @Prop({ required: true, type: Types.ObjectId, ref: "Restaurant" })
    restaurantId: Types.ObjectId;

    @Prop({ required: true, trim: true, minlength: 2, maxlength: 30, unique: true })
    name: string;

    @Prop()
    description?: string;

    @Prop({ required: true, min: 0 })
    price: number;

    @Prop()
    image?: string;

    @Prop({ required: true })
    category: string;

    @Prop({ required: true })
    unit: string;

    @Prop({ required: true, min: 0, max: 10000 })
    stock_quantity: number;

    @Prop({ enum: ITEMSTATUS, default: ITEMSTATUS.AVAILABLE })
    status: ITEMSTATUS;

    @Prop({ default: true })
    isActive: boolean;  

}

export const MenuItemSchema = SchemaFactory.createForClass(MenuItem);


MenuItemSchema.index({ restaurantId: 1, name: 1 }, { unique: true });