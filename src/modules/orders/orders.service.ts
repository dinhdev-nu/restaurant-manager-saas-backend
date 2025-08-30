import { InjectModel } from '@nestjs/mongoose';
import { Order, OrderDocument } from './schemas/oder.schema';
import { Model, Types } from 'mongoose';
import { Body } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { BadRequestException } from 'src/common/exceptions/http-exception';
import { MenuItem, MenuItemDocument } from '../restaurants/schemas/menu-items.schema';


export class OrdersService {

  constructor( 
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(MenuItem.name) private readonly menuItemModel: Model<MenuItemDocument>
  ) {}

  async create(@Body() createOrderDto: CreateOrderDto): Promise<Order> {

    if (!createOrderDto.items || createOrderDto.items.length === 0)
      throw new BadRequestException('Items are required');

    // Check Items
    const itemIds = createOrderDto.items.map(item => new Types.ObjectId(item.itemId));
    const menuItems = await this.menuItemModel.find(
      {
         _id: { $in: itemIds }, 
        restaurantId: createOrderDto.restaurantId,
        isAvailable: true
     }
    ).lean().exec();

    if (!menuItems || menuItems.length === 0 || menuItems.length !== createOrderDto.items.length)
      throw new BadRequestException('Invalid menu items');

    // Calculate Total Amount
    const totalAmount = menuItems.reduce((sum, menuItem) => {
      const orderItem = createOrderDto.items.find(item => item.itemId === menuItem._id.toString())
      if ( !orderItem || orderItem.price !== menuItem.price )
        throw new BadRequestException(`Invalid price for item ${menuItem.name}`);
      return sum + (menuItem.price * orderItem.quantity)
    }, 0)

    if ( totalAmount !== createOrderDto.totalAmount )
      throw new BadRequestException('Invalid total amount');

    // save order with pending status
    const createdOrder = new this.orderModel({
      ...createOrderDto,
      status: 'pending'
    });

    return createdOrder.save();
  }

  async addItemToOrder(orderId: string, itemId: string, quantity: number): Promise<Order> {
    const order = await this.orderModel.findById(orderId);
    if (!order || order.status === "completed") throw new BadRequestException('Order not found');


    const menuItem = await this.menuItemModel.findById(itemId).lean();
    if (!menuItem || !menuItem.isAvailable) throw new BadRequestException('Menu item not found');

    order.items.push({ itemId: menuItem._id, quantity, price: menuItem.price });
    order.totalAmount += menuItem.price * quantity;
    return order.save();
  } 

  async updateStatus(orderId: string, status: string): Promise<Order> {
    const order = await this.orderModel.findById(orderId);
    if (!order || order.status === "completed") throw new BadRequestException('Order not found');

    order.status = status;
    return order.save();
  }

}
