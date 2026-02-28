import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Payment, PaymentDocument, PaymentMethod, PaymentStatus } from './schemas/payment.schema';
import { Connection, Model, Types } from 'mongoose';
import { CreatePaymentByCashDto, CreatePaymentDto } from './dto/create-payment.dto';
import { Order, OrderDocument, OrderStatus, OrderPaymentStatus } from '../orders/schemas/order.schema';
import { BadRequestException } from 'src/common/exceptions/http-exception';
import { SseService } from '../sse/sse.service';



@Injectable()
export class PaymentsService {

  constructor(
    private readonly sseService: SseService,
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectConnection() private readonly connection: Connection // Inject the Mongoose connection
  ) {}

  async paymentByCash(createPaymentDto: CreatePaymentByCashDto, restaurantId: string): Promise<Payment> {
    const session = await this.connection.startSession()
    session.startTransaction();
    console.log('Starting payment by cash transaction...');
    let order: OrderDocument | null = null;
    try {
      const { paidAmount } = createPaymentDto; 
      
      // Kiểm tra đơn hàng
      order = await this.orderModel.findOne({
        _id: new Types.ObjectId(createPaymentDto.orderId),
        restaurantId: new Types.ObjectId(restaurantId),
      }).session(session);
      if (!order) throw new BadRequestException('Order not found');
      if (order.status === OrderStatus.CANCELLED)
        throw new BadRequestException('Order has been cancelled');
      if (order.paymentStatus === OrderPaymentStatus.PAID) 
        throw new BadRequestException('Order has been paid');
      if ( paidAmount < order.total)
        throw new BadRequestException('Paid amount is less than order total');

      // Tạo bản ghi thanh toán
      const changeAmount = paidAmount - order.total;
      const payment = await this.paymentModel.create([{
        orderId: order._id,
        restaurantId: new Types.ObjectId(restaurantId),

        orderAmount: order.total,
        paidAmount,
        changeAmount,

        method: PaymentMethod.CASH,
        status: PaymentStatus.SUCCESS,
      }], { session });

      // Cập nhật trạng thái thanh toán đơn hàng
      order.paymentStatus = OrderPaymentStatus.PAID;
      order.status = OrderStatus.COMPLETED;

      await order.save({ session });
      await session.commitTransaction();

      return payment[0].toObject();
    } catch (error) {
      await session.abortTransaction();
      console.error('Payment by cash failed:', error);
      throw new BadRequestException("Payment failed! Please try again.");
    } finally {
      await session.endSession();

      // Event 
      if ( order && order.customer?.customerId ) {
        this.sseService.sendEventToUser({
          userId: order.customer.customerId.toString(),
          type: 'payment_success',
          data: order.toObject()
        })
      } 
    }
  }

  async paymentByQrCode(createPaymentDto: CreatePaymentDto, restaurantId: string): Promise<any & { qr_url: string }> {
    
    // Kiểm tra đơn hàng
    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(createPaymentDto.orderId),
      restaurantId: new Types.ObjectId(restaurantId),
    }).lean();
    if (!order) throw new BadRequestException('Order not found');
    if (order.status === OrderStatus.CANCELLED)
      throw new BadRequestException('Order has been cancelled');
    if (order.paymentStatus === OrderPaymentStatus.PAID) 
      throw new BadRequestException('Order has been paid');
    if (createPaymentDto.amount !== order.total)
      throw new BadRequestException('Payment amount does not match order total');

    // Tạo bản ghi thanh toán
    // const payment = await this.paymentModel.create({
    //   orderId: order._id,
    //   restaurantId: new Types.ObjectId(restaurantId),
    //   orderAmount: order.total,
    //   paidAmount: 0,  // Chưa thanh toán
    //   changeAmount: 0, // Chưa thanh toán
    //   method: PaymentMethod.QR_CODE,
    //   status: PaymentStatus.PENDING,
    // });
    const payment = {
      _id: new Types.ObjectId(),
    }

    // Generate QE code 
    const bankId = process.env.BANK_ID;
    const accountNo = process.env.ACCOUNT_NO;
    const template = process.env.TEMPLATE;
    const amount = order.total;
    const description = `PM${payment._id.toString()}`;
    const qr_url = 
      `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.jpg?amount=${amount}&addInfo=${description}`;

    return { ...payment, qr_url };
  }

  
  
}
