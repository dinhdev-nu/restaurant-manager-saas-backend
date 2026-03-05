import { InjectModel } from '@nestjs/mongoose';
import { Order, OrderDocument, OrderStatus, OrderPaymentStatus } from './schemas/order.schema';
import { Model, Types } from 'mongoose';
import { Body, Inject, Injectable } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { ITEMSTATUS, MenuItem, MenuItemDocument } from '../restaurant/schemas/menu-items.schema';
import Redis from 'ioredis';
import { SseService } from '../sse/sse.service';
import { Restaurant } from '../restaurant/schemas/restaurant.schema';
import { INJECTION_TOKEN } from 'src/common/constants/injection-token.constant';
import { BadRequestException, ConflictException, NotFoundException } from 'src/common/exceptions';
import { ERROR_CODE } from 'src/common/constants/error-code.constant';

@Injectable()
export class OrderService {

  constructor( 
    private readonly sseService: SseService,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(MenuItem.name) private readonly menuItemModel: Model<MenuItemDocument>,
    @Inject(INJECTION_TOKEN.REDIS_CLIENT) private readonly redis: Redis
  ) {}

  async create(@Body() dto: CreateOrderDto): Promise<Order> {
    const { restaurantId, items, staffId, total, tax, discount } = dto

    // Check dulicate items
    const itemIds = items.map(item => item.itemId);
    const uniqueItemIds = new Set(itemIds);
    if ( uniqueItemIds.size !== items.length)
      throw new BadRequestException(ERROR_CODE.DUPLICATE_ITEMS, 'Duplicate items in order');

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
      throw new NotFoundException(MenuItem.name, 'One or more items not found');

    // Calculate Total Amount
    let totalAmount = 0;

    for ( const menuItem of menuItems) {
      const orderItem = items.find(i => i.itemId === menuItem._id)
      
      if ( !orderItem )
        throw new NotFoundException(MenuItem.name, 'Invalid item request');
      if ( orderItem.quantity > menuItem.stock_quantity || menuItem.status === ITEMSTATUS.UNAVAILABLE )
        throw new ConflictException(ERROR_CODE.INSUFFICIENT_STOCK, 'Insufficient stock for ' + menuItem.name);
      if ( orderItem.price !== menuItem.price )
        throw new ConflictException(ERROR_CODE.CONFLICT_INPUT_ERROR, 'Invalid price for ' + menuItem.name);

      totalAmount += menuItem.price * orderItem.quantity;
    }
    totalAmount = totalAmount + tax - discount;
    
    if ( totalAmount !== total )
      throw new ConflictException(ERROR_CODE.CONFLICT_INPUT_ERROR, 'Invalid total amount');

    // Transact stock update
    // BulkWrite for stock update

    // save order with pending status
    const orderData = await this.validateOrderFromUser(dto);
    const newOrder = await this.orderModel.create(orderData);

    if ( dto.customer?.customerId ) {
      this.sseService.sendEventToUser({ 
        userId: dto.customer.customerId.toString() || '', // Đảm bảo userId là string
        type: 'new_order_confirmed',
        data: newOrder.toObject()
      })
      await this.redis.del(`draft_order:${restaurantId}:${newOrder._id.toString()}`);
    }

    return newOrder;
  }

  async validateOrderFromUser(dto: CreateOrderDto): Promise<OrderDocument> {
    const orderData = {
      restaurantId: dto.restaurantId,
      staffId: dto.staffId ? dto.staffId : undefined,
      status: OrderStatus.PENDING,
      table: dto.table,
      staff: dto.staff,
      customer: dto.customer ? {
        customerId: dto.customer.customerId ? dto.customer.customerId : undefined,
        name: dto.customer.name,
        contact: dto.customer.contact
      } : undefined,
      items: dto.items.map(item => ({
        itemId: item.itemId,
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
      const orderCache = await this.redis.get(`draft_order:${dto.restaurantId}:${dto._id}`);
      if ( !orderCache ) {
        throw new NotFoundException(Order.name, dto._id || 'unknown');
      }
      orderData._id = dto._id || new Types.ObjectId();
      orderData.status = OrderStatus.PROGRESS
    }

    return orderData;
  }

  async createDraftOrder(dto: CreateOrderDto): Promise<Order & { expiredAt: Date }> {
    const { restaurantId, items, staffId, total, tax, discount } = dto;

    // Check restaurant open status
    const restaurantData = await this.redis.get(`restaurant_opened:${restaurantId}`);
    if ( !restaurantData )
      throw new NotFoundException(Restaurant.name, 'Restaurant is closed');

    const restaurant = JSON.parse(restaurantData) as Restaurant;
    const { ownerId } = restaurant;

    // Check dulicate items
    const itemIds = items.map(item => item.itemId);
    const uniqueItemIds = new Set(itemIds);
    if ( uniqueItemIds.size !== items.length)
      throw new BadRequestException(ERROR_CODE.DUPLICATE_ITEMS, 'Duplicate items in order');

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
      throw new NotFoundException(MenuItem.name, 'One or more items not found');

    // Calculate Total Amount
    let totalAmount = 0;

    for ( const menuItem of menuItems) {
      const orderItem = items.find(i => i.itemId === menuItem._id)
      
      if ( !orderItem )
        throw new NotFoundException(MenuItem.name, 'Invalid item request');
      if ( orderItem.quantity > menuItem.stock_quantity || menuItem.status === ITEMSTATUS.UNAVAILABLE )
        throw new ConflictException(ERROR_CODE.INSUFFICIENT_STOCK, 'Insufficient stock for ' + menuItem.name);
      if ( orderItem.price !== menuItem.price )
        throw new ConflictException(ERROR_CODE.CONFLICT_INPUT_ERROR, 'Invalid price for ' + menuItem.name);

      totalAmount += menuItem.price * orderItem.quantity;
    }
    totalAmount = totalAmount + tax - discount;
    
    if ( totalAmount !== total )
      throw new ConflictException(ERROR_CODE.CONFLICT_INPUT_ERROR, 'Invalid total amount');


    // create a document without saving to MongoDB
    const newOrder = new this.orderModel({
      ...dto,
      restaurantId: restaurantId,
      staffId: staffId,
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

  async saveDaftOrderToDB(order: OrderDocument, restaurantId: Types.ObjectId): Promise<Date>{
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

  async getOrdersForUser(restaurantId: Types.ObjectId, userId: Types.ObjectId): Promise<any>  {
    const now = new Date()
    now.setHours(0, 0, 0, 0); 
    console.log('Getting orders for user:', { restaurantId, userId, date: now });
    const [orders, draftOrders] = await Promise.all([
      this.orderModel.find({
        restaurantId: restaurantId,
        createdAt: { $gte: now },
        'customer.customerId': userId
      }).lean().exec(),
      this.getListDraftOrders(restaurantId, userId)
    ])

    return { orders, draftOrders };
  }

  async getListDraftOrders(restaurantId: Types.ObjectId, userId?: Types.ObjectId): Promise<Order[]> {
    
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
        && order.customer.customerId === userId
      )
    }

    return draftOrders;
  }

  async findOrdersByRestaurant(
    restaurantId: Types.ObjectId,
    page: number = 1, 
    limit: number = 20,
    fillter?: { 
      status?: OrderStatus 
    }
  ): Promise<Order[]> {
    const query: any = { restaurantId };
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


  async getOrderCheckoutDetailsById(orderId: Types.ObjectId): Promise<Order> {

    const order = await this.orderModel.findById(orderId);
    if ( !order )
      throw new NotFoundException(Order.name, orderId);
    if ( order.paymentStatus !== OrderPaymentStatus.UNPAID)
      throw new ConflictException(ERROR_CODE.CONFLICT_INPUT_ERROR, 'Order already paid');

    // Check Amount

    return order.toObject()
  }


  async changeOrderStatus(orderId: Types.ObjectId, status: OrderStatus): Promise<Order> {
    const order = await this.orderModel.findById(orderId);
    if ( !order )
      throw new NotFoundException(Order.name, orderId);

    order.status = status;
    await order.save()
    return order.toObject();
  }

}
