import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type OrderDocument = HydratedDocument<Order>;


export enum OrderStatus {
    PENDING = 'pending',
    PROGRESS = 'progress',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled'
}
export enum OrderPaymentStatus {
    UNPAID = 'unpaid',
    PAID = 'paid',
    PARTIAL = 'partial',
    REFUNDED = 'refunded'
}

@Schema({ _id: false })
export class ItemCart {
    @Prop({ type: Types.ObjectId, ref: 'MenuItem', required: true })
    itemId: Types.ObjectId;
    @Prop({ required: true, trim: true })
    name: string;
    @Prop({ required: true , min: 1})
    quantity: number;
    @Prop({ required: true, min: 0 })
    price: number;
    @Prop()
    note?: string;
}

@Schema({ _id: false })
export class Customer {
    @Prop({ type: Types.ObjectId, ref: 'User' })
    customerId?: Types.ObjectId;
    @Prop({ required: true, trim: true })
    name: string;
    @Prop({ required: true, trim: true })
    contact: string;
}

@Schema({ timestamps: true })
export class Order {

    @Prop({ type: Types.ObjectId, ref: 'Restaurant', required: true })
    restaurantId: Types.ObjectId;

    @Prop({ required: true })
    table: string;

    @Prop({ type: Types.ObjectId, ref: 'Staff'})
    staffId?: Types.ObjectId;

    @Prop({ required: true, trim: true })
    staff: string;

    @Prop({ enum: OrderStatus, default: OrderStatus.PENDING })
    status: OrderStatus;

    @Prop({ type: Customer, _id: false})
    customer?: Customer;

    @Prop({ type: [ItemCart], _id: false })
    items: ItemCart[]

    @Prop({ required: true, min: 0 })
    subtotal: number;

    @Prop({ required: true, min: 0 })
    tax: number;

    @Prop({ required: true, min: 0 })
    discount: number;

    @Prop({ required: true, min: 0 })
    total: number;

    @Prop({ enum: OrderPaymentStatus, default: OrderPaymentStatus.UNPAID })
    paymentStatus: OrderPaymentStatus;

}
    
export const OrderSchema = SchemaFactory.createForClass(Order);