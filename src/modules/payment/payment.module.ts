import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentSchema } from './schemas/payment.schema';
import { OrderSchema } from '../order/schemas/order.schema';
import { SseModule } from '../sse/sse.module';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService],
  imports: [
    MongooseModule.forFeature([
      { name: "Payment", schema: PaymentSchema },
      { name: "Order", schema: OrderSchema }
    ]),
    SseModule
  ]
})
export class PaymentModule {}
