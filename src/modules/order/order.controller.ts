import { Body, Controller, DefaultValuePipe, Get, Param, ParseBoolPipe, ParseIntPipe, Post, Query } from '@nestjs/common';
import { OrderService } from './order.service';
import { CurrentUser, Roles } from 'src/common/decorators';
import { CreateOrderDto } from './dto/create-order.dto';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto';
import { ParseObjectIdPipe } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ROLE } from 'src/common/constants/role.constant';


@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}


  @Post()
  @Roles( ROLE.ADMIN, ROLE.USER )
  createOrder(@Body() dto: CreateOrderDto) {
    return this.orderService.create(dto);
  }


  // Cần cơ chế chống spam
  @Post('/draft')
  createDraftOrder(@Body() dto: CreateOrderDto) {
    return this.orderService.createDraftOrder(dto);
  }

  @Get('/drafts/:restaurantId')
  @Roles(ROLE.ADMIN, ROLE.USER)
  getDraftOrders(
    @CurrentUser('sub') userId: Types.ObjectId,
    @Param('restaurantId', ParseObjectIdPipe) restaurantId: Types.ObjectId, 
    @Query('isMyDrafts', new ParseBoolPipe({ optional: true })) isMyDrafts?: boolean
  ) {
    const targetUserId = isMyDrafts ? userId : undefined;
    
    return this.orderService.getListDraftOrders(restaurantId, targetUserId);
  }

  @Post('/change-status')
  @Roles(ROLE.ADMIN, ROLE.USER)
  changeOrderStatus(@Body() dto: ChangeOrderStatusDto) {
    const { orderId, status } = dto;
    return this.orderService.changeOrderStatus(orderId, status);
  }
  
  @Get('/user/:restaurantId')
  @Roles(ROLE.ADMIN, ROLE.USER)
  getOrdersForUser(
    @CurrentUser("sub") userId: Types.ObjectId,
    @Param('restaurantId', ParseObjectIdPipe) restaurantId: Types.ObjectId
  ) {
    return this.orderService.getOrdersForUser(restaurantId, userId);
  }

  @Get('/:restaurantId')
  @Roles( ROLE.ADMIN, ROLE.USER )
  getOrders(
    @Param('restaurantId', ParseObjectIdPipe) restaurantId: Types.ObjectId, 
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status') status?: any
  ) {
    console.log('Query Params:', { page, limit, status });
    return this.orderService.findOrdersByRestaurant(restaurantId, page, limit, { status: status });
  }


  @Get('/checkout/:orderId')
  @Roles( ROLE.ADMIN, ROLE.USER )
  getOrderCheckoutDetails(@Param('orderId', ParseObjectIdPipe) orderId: Types.ObjectId) {
    return this.orderService.getOrderCheckoutDetailsById(orderId);
  }

}
