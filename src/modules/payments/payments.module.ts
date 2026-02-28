import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentSchema } from './schemas/payment.schema';
import { OrderSchema } from '../orders/schemas/order.schema';
import { SseModule } from '../sse/sse.module';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService],
  imports: [
    MongooseModule.forFeature([
      { name: "Payment", schema: PaymentSchema },
      { name: "Order", schema: OrderSchema }
    ]),
    SseModule
  ]
})
export class PaymentsModule {}
