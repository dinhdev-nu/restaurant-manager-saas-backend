import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type PaymentDocument = HydratedDocument<Payment>;

export enum PaymentStatus {
    PENDING = 'pending',
    SUCCESS = 'success',
    FAILED = 'failed'
}

export enum PaymentMethod {
    CREDIT_CARD = 'credit_card',
    PAYPAL = 'paypal',
    CASH = 'cash',
    QR_CODE = 'qr_code',
}

@Schema({ timestamps: true })
export class Payment {
    @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
    orderId: Types.ObjectId

    @Prop({ type: Types.ObjectId, ref: 'Restaurant', required: true })
    restaurantId: Types.ObjectId

    @Prop({ required: true })
    orderAmount: number // Tổng tiền đơn hàng

    @Prop({ required: true })
    paidAmount: number // Số tiền khách đưa

    @Prop({ required: true })
    changeAmount: number // Tiền thừa

    @Prop({ enum: PaymentMethod, required: true })
    method: PaymentMethod;

    @Prop({ enum: PaymentStatus, default: PaymentStatus.PENDING })
    status: PaymentStatus;

    @Prop()
    transactionId?: string; // ID giao dịch từ cổng thanh toán

}


export const PaymentSchema = SchemaFactory.createForClass(Payment);
