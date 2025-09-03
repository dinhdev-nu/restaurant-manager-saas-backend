import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { Model, Types } from 'mongoose';
import { CreatePaymentByCashDto, CreatePaymentDto } from './dto/create-payment.dto';
import { Order, OrderDocument } from '../orders/schemas/oder.schema';
import { BadRequestException } from 'src/common/exceptions/http-exception';

@Injectable()
export class PaymentsService {

  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
  ) {}

  async paymentByCash(createPaymentDto: CreatePaymentByCashDto, restaurantId: string): Promise<Payment> {
    // Check order 
    const order = await this.orderModel.findById(new Types.ObjectId(createPaymentDto.orderId));
    if (!order) throw new BadRequestException("Order not found");

    if ( order.status !== "served" || order.isPaid ) throw new BadRequestException("Order is not served or completed");

    // New payment
    const newPayment = new this.paymentModel({
      order: order._id,
      amount: createPaymentDto.amount,
      paymentMethod: "cash",
      status: "success",
      restaurant: restaurantId
    });

    // Update order status
    order.isPaid = true;
    await newPayment.save(); 
    await order.save();

    return newPayment;
  }


  async paymentByOther(createPaymentDto: CreatePaymentDto, restaurantId: string) {
    
  }
    

}
