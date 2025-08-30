import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

export type OrderDocument = Order & Document;

@Schema({ timestamps: true })
export class Order {

    @Prop({ type: Types.ObjectId, ref: 'Restaurant', required: true })
    restaurantId: Types.ObjectId;

    @Prop([
        {
            itemId: { type: Types.ObjectId, ref: 'MenuItem', required: true },
            quantity: { type: Number, required: true , min: 1},
            price: { type: Number, required: true }
        }
    ])
    items: {
        itemId: Types.ObjectId;
        quantity: number;
        price: number;
    }[];

    @Prop({ required: true })
    totalAmount: number;

    @Prop({ required: true, enum: ['pending', 'preparing', 'served', 'completed', 'cancelled'], default: 'pending' })
    status: string;

    @Prop({ enum: ['credit_card', 'paypal', 'cash'], required: true })
    paymentMethod: string;

    @Prop({ default: false })
    isPaid: boolean;

}

export const OrderSchema = SchemaFactory.createForClass(Order);
