import { Body, Controller, Get, Param, ParseBoolPipe, ParseIntPipe, Post, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { Protected, Roles, UserSession } from 'src/common/decorator';
import { Role } from 'src/common/enums/roles.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto';
import { UserHeaderRequest } from 'src/common/guards/jwt/jwt.guard';


@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}


  @Post()
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER )
  createOrder(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(createOrderDto);
  }


  // Cần cơ chế chống spam
  @Post('/draft')
  createDraftOrder(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.createDraftOrder(createOrderDto);
  }

  @Get('/drafts/:restaurantId')
  @Protected()
  @Roles(Role.ADMIN, Role.CUSTOMER)
  getDraftOrders(
    @UserSession() user: UserHeaderRequest,
    @Param('restaurantId') restaurantId: string, 
    @Query('isMyDrafts', new ParseBoolPipe({ optional: true })) isMyDrafts?: boolean
  ) {
    const targetUserId = isMyDrafts ? user.ATPayload.sub : undefined;
    
    return this.ordersService.getListDraftOrders(restaurantId, targetUserId);
  }

  @Post('/change-status')
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER )
  changeOrderStatus(@Body() changeOrderStatusDto: ChangeOrderStatusDto) {
    const { orderId, status } = changeOrderStatusDto;
    return this.ordersService.changeOrderStatus(orderId, status);
  }
  
  @Get('/user/:restaurantId')
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER )
  getOrdersForUser(
    @UserSession() user: UserHeaderRequest,
    @Param('restaurantId') restaurantId: string
  ) {
    return this.ordersService.getOrdersForUser(restaurantId, user.ATPayload.sub);
  }

  @Get('/:restaurantId')
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER )
  getOrders(
    @Param('restaurantId') restaurantId: string, 
    @Query('page', ParseIntPipe) page: number,
    @Query('limit', ParseIntPipe) limit: number,
    @Query('status') status?: any
  ) {
    console.log('Query Params:', { page, limit, status });
    return this.ordersService.findOrdersByRestaurant(restaurantId, page, limit, { status: status });
  }


  @Get('/checkout/:orderId')
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER )
  getOrderCheckoutDetails(@Param('orderId') orderId: string) {
    return this.ordersService.getOrderCheckoutDetailsById(orderId);
  }

}
