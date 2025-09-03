import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

export type PaymentDocument = Payment & Document;

@Schema({ timestamps: true })
export class Payment {
    @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
    orderId: Types.ObjectId

    @Prop({ type: Types.ObjectId, ref: 'Restaurant', required: true })
    restaurantId: Types.ObjectId

    @Prop({ required: true })
    amount: number

    @Prop({ enum: ['credit_card', 'paypal', 'bank_transfer', 'cash'], required: true })
    method: string

    @Prop({ enum: ['pending', 'success', 'failed'], default: 'pending' })
    status: string;

    @Prop()
    transactionId?: string;

    @Prop({ default: Date.now })
    paidAt: Date;

}


export const PaymentSchema = SchemaFactory.createForClass(Payment);
