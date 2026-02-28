import { InjectModel } from '@nestjs/mongoose';
import { Order, OrderDocument, OrderStatus, OrderPaymentStatus } from './schemas/order.schema';
import { Model, set, Types } from 'mongoose';
import { Body, Inject, Injectable } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { BadRequestException } from 'src/common/exceptions/http-exception';
import { ITEMSTATUS, MenuItem, MenuItemDocument } from '../restaurants/schemas/menu-items.schema';
import { REDIS_CLIENT } from 'src/common/constants/redis.const';
import Redis from 'ioredis';
import { SseService } from '../sse/sse.service';
import { Restaurant } from '../restaurants/schemas/restaurant.schema';

@Injectable()
export class OrdersService {

  constructor( 
    private readonly sseService: SseService,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(MenuItem.name) private readonly menuItemModel: Model<MenuItemDocument>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  async create(@Body() createOrderDto: CreateOrderDto): Promise<Order> {
    const { restaurantId, items, staffId, total, tax, discount } = createOrderDto
    console.log('Creating order with data:', createOrderDto);
    // Check dulicate items
    const itemIds = items.map(item => item.itemId);
    const uniqueItemIds = new Set(itemIds);
    if ( uniqueItemIds.size !== items.length)
      throw new BadRequestException('Duplicate items in order');

    // Check staff (optional)
    if ( staffId ) {}

    // Check table
    // Check table status

    // Get items details from MenuItem
    const select = ['_id', 'price',  'stock_quantity', 'status'];
    const menuItems = await this.menuItemModel.find(
      {
         _id: { $in: itemIds }, 
        isActive: true
     }
    ).select(select).lean().exec();

    if ( menuItems.length !== items.length )
      throw new BadRequestException('Invalid menu items');

    // Calculate Total Amount
    let totalAmount = 0;

    for ( const menuItem of menuItems) {
      const orderItem = items.find(i => i.itemId === menuItem._id.toString())
      
      if ( !orderItem )
        throw new BadRequestException('Invalid item request');
      if ( orderItem.quantity < 1 )
        throw new BadRequestException('Invalid item quantity for ' + menuItem.name);
      if ( orderItem.quantity > menuItem.stock_quantity || menuItem.status === ITEMSTATUS.UNAVAILABLE )
        throw new BadRequestException('Insufficient stock for ' + menuItem.name);
      if ( orderItem.price !== menuItem.price )
        throw new BadRequestException('Invalid price for ' + menuItem.name);

      totalAmount += menuItem.price * orderItem.quantity;
    }
    totalAmount = totalAmount + tax - discount;
    
    if ( totalAmount !== total )
      throw new BadRequestException('Invalid total amount');

    // Transact stock update
    // BulkWrite for stock update

    // save order with pending status
    const orderData = await this.validateOrderFromUser(createOrderDto);
    const newOrder = await this.orderModel.create(orderData);

    if ( createOrderDto.customer?.customerId ) {
      this.sseService.sendEventToUser({ 
        userId: createOrderDto.customer.customerId,
        type: 'new_order_confirmed',
        data: newOrder.toObject()
      })
      await this.redis.del(`draft_order:${restaurantId}:${newOrder._id.toString()}`);
    }

    return newOrder;
  }

  async validateOrderFromUser(dto: CreateOrderDto): Promise<OrderDocument> {
    const orderData = {
      restaurantId: new Types.ObjectId(dto.restaurantId),
      staffId: dto.staffId ? new Types.ObjectId(dto.staffId) : undefined,
      status: OrderStatus.PENDING,
      table: dto.table,
      staff: dto.staff,
      customer: dto.customer ? {
        customerId: dto.customer.customerId ? new Types.ObjectId(dto.customer.customerId) : undefined,
        name: dto.customer.name,
        contact: dto.customer.contact
      } : undefined,
      items: dto.items.map(item => ({
        itemId: new Types.ObjectId(item.itemId),
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        note: item.note
      })),
      subtotal: dto.subtotal,
      tax: dto.tax,
      discount: dto.discount,
      total: dto.total
    } as OrderDocument;

    if ( orderData.customer?.customerId ) {
      if ( !Types.ObjectId.isValid(dto._id || "") ){
        throw new BadRequestException('orderId should not be provided or must be a valid ObjectId');
      }
      const orderCache = await this.redis.get(`draft_order:${dto.restaurantId}:${dto._id}`);
      if ( !orderCache ) {
        throw new BadRequestException('Draft order not found');
      }
      orderData._id = new Types.ObjectId(dto._id);
      orderData.status = OrderStatus.PROGRESS
    }

    return orderData;
  }

  async createDraftOrder(createOrderDto: CreateOrderDto): Promise<Order & { expiredAt: Date }> {
    const { restaurantId, items, staffId, total, tax, discount } = createOrderDto

    // Check restaurant open status
    const restaurantData = await this.redis.get(`restaurant_opened:${restaurantId}`);
    if ( !restaurantData )
      throw new BadRequestException('Restaurant is closed');

    const restaurant = JSON.parse(restaurantData) as Restaurant;
    const { ownerId } = restaurant;

    // Check dulicate items
    const itemIds = items.map(item => item.itemId);
    const uniqueItemIds = new Set(itemIds);
    if ( uniqueItemIds.size !== items.length)
      throw new BadRequestException('Duplicate items in order');

    // Check staff (optional)
    if ( staffId ) {}

    // Check table
    // Check table status

    // Get items details from MenuItem
    const select = ['_id', 'price',  'stock_quantity', 'status'];
    const menuItems = await this.menuItemModel.find(
      {
         _id: { $in: itemIds }, 
        isActive: true
     }
    ).select(select).lean().exec();

    if ( menuItems.length !== items.length )
      throw new BadRequestException('Invalid menu items');

    // Calculate Total Amount
    let totalAmount = 0;

    for ( const menuItem of menuItems) {
      const orderItem = items.find(i => i.itemId === menuItem._id.toString())
      
      if ( !orderItem )
        throw new BadRequestException('Invalid item request');
      if ( orderItem.quantity < 1 )
        throw new BadRequestException('Invalid item quantity for ' + menuItem.name);
      if ( orderItem.quantity > menuItem.stock_quantity || menuItem.status === ITEMSTATUS.UNAVAILABLE )
        throw new BadRequestException('Insufficient stock for ' + menuItem.name);
      if ( orderItem.price !== menuItem.price )
        throw new BadRequestException('Invalid price for ' + menuItem.name);

      totalAmount += menuItem.price * orderItem.quantity;
    }
    totalAmount = totalAmount + tax - discount;
    
    if ( totalAmount !== total )
      throw new BadRequestException('Invalid total amount');

    // create a document without saving to MongoDB
    const newOrder = new this.orderModel({
      ...createOrderDto,
      restaurantId: new Types.ObjectId(restaurantId),
      staffId: staffId ? new Types.ObjectId(staffId) : undefined,
      status: OrderStatus.PENDING
    })

    // Save to Redis with expiry (e.g., 1 hour)
    const orderExpiredAt = await this.saveDaftOrderToDB(newOrder, restaurantId);
    
    // Send SSE event to restaurant owner
    this.sseService.sendEventToUser({
      userId: ownerId.toString() || '', // Đảm bảo userId là string
      type: 'new_draft_order',
      data: { ...newOrder.toObject(), expiredAt: orderExpiredAt }
    })

    return { ...newOrder.toObject(), expiredAt: orderExpiredAt };
  }

  async saveDaftOrderToDB(order: OrderDocument, restaurantId: string): Promise<Date>{
    const ttl = 3600
    const expiredAt = Math.floor(Date.now() / 1000) + ttl;
    const orderExpiredAt = new Date(expiredAt * 1000);

    const orderId = order._id.toString()
     const draftKey = `draft_order:${restaurantId}:${orderId}`;
    const indexKey = `draft_orders:${restaurantId}`;

    await this.redis.multi()
      .set(draftKey, JSON.stringify({ ...order.toObject(), expiredAt: orderExpiredAt }), 'EX', ttl)
      .zadd(indexKey, expiredAt, orderId)
      .exec();

    return orderExpiredAt;
  }

  async getOrdersForUser(restaurantId: string, userId: string): Promise<any>  {
    const now = new Date()
    now.setHours(0, 0, 0, 0); 
    console.log('Getting orders for user:', { restaurantId, userId, date: now });
    const [orders, draftOrders] = await Promise.all([
      this.orderModel.find({
        restaurantId: new Types.ObjectId(restaurantId),
        createdAt: { $gte: now },
        'customer.customerId': new Types.ObjectId(userId)
      }).lean().exec(),
      this.getListDraftOrders(restaurantId, userId)
    ])

    return { orders, draftOrders };
  }

  async getListDraftOrders(restaurantId: string, userId?: string): Promise<Order[]> {
    
    const now = Math.floor(Date.now() / 1000);
    const indexKey = `draft_orders:${restaurantId}`;
    const dataKeyPrefix = `draft_order:${restaurantId}`; // Phải khớp với saveDraftOrder

    // 1. Dọn dẹp các ID đã hết hạn trong Index
    await this.redis.zremrangebyscore(indexKey, 0, now);

    // 2. Lấy danh sách ID còn hạn
    const draftIds = await this.redis.zrange(indexKey, 0, -1);
    if (draftIds.length === 0) return [];

    // 3. Ghép đúng Key để MGET
    const keys = draftIds.map(id => `${dataKeyPrefix}:${id}`);
    const draftsData = await this.redis.mget(...keys);

    // 4. Lọc bỏ null (trường hợp Key String hết hạn trước khi Index kịp xóa)
    const draftOrders = draftsData
        .filter((data): data is string => data !== null)
        .map(data => JSON.parse(data) as Order);
    
    // 5. Nếu userId được cung cấp, lọc tiếp theo userId
    if (userId) {
      return draftOrders.filter(order => order.customer 
        && order.customer.customerId
        && order.customer.customerId.toString() === userId
      )
    }

    return draftOrders;
  }

  async findOrdersByRestaurant(
    restaurantId: string,
    page: number = 1, 
    limit: number = 20,
    fillter?: { 
      status?: OrderStatus 
    }
  ): Promise<Order[]> {
    const query: any = { restaurantId: new Types.ObjectId(restaurantId) };
    if (fillter?.status) {
      query.status = fillter.status;
    }

    const skip = (page -1) * limit;
    const select = ['-__v', '-restaurantId'];
    const orders = await this.orderModel.find(query)
                  .sort({ updatedAt: -1 })
                  .skip(skip)
                  .limit(limit)
                  .select(select)
                  .lean()
                  .exec();
    return orders;  
  }


  async getOrderCheckoutDetailsById(orderId: string): Promise<Order> {

    // Validate OrderId
    if (!Types.ObjectId.isValid(orderId)) {
      throw new BadRequestException('Invalid order ID');
    }

    const order = await this.orderModel.findById(new Types.ObjectId(orderId));
    if ( !order )
      throw new BadRequestException('Order not found');
    if ( order.paymentStatus !== OrderPaymentStatus.UNPAID)
      throw new BadRequestException('Order already paid');

    // Check Amount

    return order.toObject()
  }


  async changeOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
    const order = await this.orderModel.findById(new Types.ObjectId(orderId));
    if ( !order )
      throw new BadRequestException('Order not found');

    order.status = status;
    await order.save()
    return order.toObject();
  }

}
