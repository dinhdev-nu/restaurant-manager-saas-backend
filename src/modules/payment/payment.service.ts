import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Payment, PaymentDocument, PaymentMethod, PaymentStatus } from './schemas/payment.schema';
import { Connection, Model, Types } from 'mongoose';
import { CreatePaymentByCashDto, CreatePaymentDto } from './dto/create-payment.dto';
import { Order, OrderDocument, OrderStatus, OrderPaymentStatus } from '../order/schemas/order.schema';
import { SseService } from '../sse/sse.service';
import { AppConfigService } from 'src/config/config.service';
import { BadRequestException, ConflictException, NotFoundException } from 'src/common/exceptions';
import { ERROR_CODE } from 'src/common/constants/error-code.constant';
import { InternalServerException } from 'src/common/exceptions/http/internal-server.exception';



@Injectable()
export class PaymentService {

  constructor(
    private readonly sseService: SseService,
    private readonly config: AppConfigService,
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectConnection() private readonly connection: Connection // Inject the Mongoose connection
  ) {}

  async paymentByCash(dto: CreatePaymentByCashDto, restaurantId: Types.ObjectId): Promise<Payment> {
    const session = await this.connection.startSession()
    session.startTransaction();
    console.log('Starting payment by cash transaction...');
    let order: OrderDocument | null = null;
    try {
      const { paidAmount } = dto; 
      
      // Kiểm tra đơn hàng
      order = await this.orderModel.findOne({
        _id: dto.orderId,
        restaurantId: restaurantId,
      }).session(session);
      if (!order) throw new NotFoundException(Order.name, dto.orderId);
      if (order.status === OrderStatus.CANCELLED)
        throw new ConflictException(ERROR_CODE.CONFLICT_INPUT_ERROR, 'Order has been cancelled');
      if (order.paymentStatus === OrderPaymentStatus.PAID) 
        throw new ConflictException(ERROR_CODE.CONFLICT_INPUT_ERROR, 'Order has been paid');
      if ( paidAmount < order.total)
        throw new BadRequestException(ERROR_CODE.INVALID_INPUT_ERROR, 'Paid amount is less than order total');

      // Tạo bản ghi thanh toán
      const changeAmount = paidAmount - order.total;
      const payment = await this.paymentModel.create([{
        orderId: order._id,
        restaurantId: restaurantId,

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
      throw new InternalServerException(ERROR_CODE.TRANSACTION_ERROR, "Payment failed! Please try again.");
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

  async paymentByQrCode(dto: CreatePaymentDto, restaurantId: Types.ObjectId): Promise<any & { qr_url: string }> {
    
    // Kiểm tra đơn hàng
    const order = await this.orderModel.findOne({
      _id: dto.orderId,
      restaurantId: restaurantId,
    }).lean();
    if (!order) throw new NotFoundException(Order.name, dto.orderId);
    if (order.status === OrderStatus.CANCELLED)
      throw new ConflictException(ERROR_CODE.CONFLICT_INPUT_ERROR, 'Order has been cancelled');
    if (order.paymentStatus === OrderPaymentStatus.PAID) 
      throw new ConflictException(ERROR_CODE.CONFLICT_INPUT_ERROR, 'Order has been paid');
    if (dto.amount !== order.total)
      throw new BadRequestException(ERROR_CODE.INVALID_INPUT_ERROR, 'Payment amount does not match order total');

    // Tạo bản ghi thanh toán
    // const payment = await this.paymentModel.create({
    //   orderId: order._id,
    //   restaurantId: restaurantId,
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
    const bankId = this.config.client.bankId;
    const accountNo = this.config.client.accountNo;
    const template = this.config.client.template;
    const amount = order.total;
    const description = `PM${payment._id.toString()}`;
    const qr_url = 
      `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.jpg?amount=${amount}&addInfo=${description}`;

    return { ...payment, qr_url };
  }

  
  
}
