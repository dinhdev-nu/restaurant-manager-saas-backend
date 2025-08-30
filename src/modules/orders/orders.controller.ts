import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtGuard } from 'src/common/guards/jwt/jwt.guard';
import { Roles } from 'src/common/decorator/roles.decorator';
import { Role } from 'src/common/enums/roles.enum';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}


  @Post()
  @UseGuards( JwtGuard )
  @Roles( Role.ADMIN )
  createOrder(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(createOrderDto);
  }

  @Post(':orderId')
  @UseGuards( JwtGuard )
  @Roles( Role.ADMIN )
  addItemToOrder(@Param('orderId') orderId: string, @Body() body: {
    itemId: string;
    quantity: number;
  }) {
    return this.ordersService.addItemToOrder(orderId, body.itemId, body.quantity);
  }


  @Post(':orderId/status')
  @UseGuards( JwtGuard )
  @Roles( Role.ADMIN )
  updateOrderStatus(@Param('orderId') orderId: string, @Body() body: {
    status: string;
  }) {
    return this.ordersService.updateStatus(orderId, body.status);
  }

}
