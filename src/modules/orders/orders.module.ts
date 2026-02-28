import { Module, Sse } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { OrderSchema } from './schemas/order.schema';
import { MenuItemSchema } from '../restaurants/schemas/menu-items.schema';
import { SseModule } from '../sse/sse.module';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  imports: [
    MongooseModule.forFeature([
      { name: "Order", schema: OrderSchema },
      { name: "MenuItem", schema: MenuItemSchema }
    ]),
    SseModule
  ]
})
export class OrdersModule {}
