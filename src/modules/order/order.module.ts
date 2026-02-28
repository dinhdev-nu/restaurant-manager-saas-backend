import { Module, Sse } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { OrderSchema } from './schemas/order.schema';
import { MenuItemSchema } from '../restaurant/schemas/menu-items.schema';
import { SseModule } from '../sse/sse.module';

@Module({
  controllers: [OrderController],
  providers: [OrderService],
  imports: [
    MongooseModule.forFeature([
      { name: "Order", schema: OrderSchema },
      { name: "MenuItem", schema: MenuItemSchema }
    ]),
    SseModule
  ]
})
export class OrderModule {}
