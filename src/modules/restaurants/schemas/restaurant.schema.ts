import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

export type RestaurantDocument =  Restaurant & Document;

@Schema()
export class Restaurant {
  @Prop({ required: true, trim: true, length: 25 })
  name: string;

  @Prop({ type: Types.ObjectId, required: true, ref: "User" })
  ownerId: Types.ObjectId

  @Prop({ required: true })
  address: string;

  @Prop()
  phone?: string

  @Prop()
  email?: string;

  @Prop({ default: true })
  isActive: boolean;

}

export const RestaurantSchema = SchemaFactory.createForClass(Restaurant);
