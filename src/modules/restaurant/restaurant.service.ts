import { InjectModel } from '@nestjs/mongoose';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { Restaurant, RestaurantDocument } from './schemas/restaurant.schema';
import { Model, Types } from 'mongoose';
import { ITEMSTATUS, MenuItem, MenuItemDocument } from './schemas/menu-items.schema';
import { CreateItemDto } from './dto/create-item.dto';
import { Shift, Staff, StaffDocument } from './schemas/staff.schema';
import { User, UserDocument } from '../auth/schema/user.schema';
import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { TABLE_NAME, TableDocument } from './schemas/table.schema';
import { CreateTableDto } from './dto/create-table.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { INJECTION_TOKEN } from 'src/common/constants/injection-token.constant';
import { ROLE } from 'src/common/constants/role.constant';
import { UserHeaderRequest } from '../auth/auth.types';
import { RESTAURANT_ROLE, RestaurantRole } from 'src/common/constants/restaurant-role.constant';
import { ConflictException, ForbiddenException, NotFoundException } from 'src/common/exceptions';
import { TimeUtil } from 'src/common/utils/time.util';
import { ERROR_CODE } from 'src/common/constants/error-code.constant';

export interface MenuItemsOut {
  active: MenuItem[];
  inactive: MenuItem[];
  totalItems: number;
}

@Injectable()
export class RestaurantService {

  constructor (
    @InjectModel(Restaurant.name) private readonly restaurantModel: Model<RestaurantDocument>,
    @InjectModel(MenuItem.name) private readonly menuItemModel: Model<MenuItemDocument>,
    @InjectModel(Staff.name) private readonly staffModel: Model<StaffDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(TABLE_NAME) private readonly tableModel: Model<TableDocument>,
    @Inject(INJECTION_TOKEN.REDIS_CLIENT) private readonly redis: Redis
  ) {}

  async create(user: UserHeaderRequest, dto: CreateRestaurantDto): Promise<RestaurantDocument> {

    // Kiểm tra nhà hàng tạo 1 lần nữa thì trả về lựa chọn là cở sở 2 hay gì đó 
    const { ATPayload: payload } = user

    const newRestaurant = await this.restaurantModel.create({
      ...dto,
      ownerId: user.info._id,
    });

    // Update User role 
    if (user.info.role === ROLE.GUEST) {
      // Update value session in redis
      user.info.role = ROLE.USER
      user.ATPayload.role = ROLE.USER
      const ttl = await this.redis.ttl(`auth:${payload.sub}:${payload.sid}`);
      await Promise.all([
        this.redis.set(`auth:${payload.sub}:${payload.sid}`, JSON.stringify(user), 'EX', ttl),
        this.userModel.updateOne(
          { _id: user.info._id},
          { role: ROLE.USER }
        ).exec()
      ])
    }

    
    // Create a owner
    const { email, phone, user_name, avatar } = user.info;
    await this.staffModel.create({
      userId: user.info._id,
      restaurantId: newRestaurant._id,
      name: user_name,
      email,
      phone,
      avatar,
      role: RESTAURANT_ROLE.OWNER,
      shift: Shift.FULLTIME,
      workingHours: "24h",
      joinDate: new Date(),
      salary: 0,
    })
    
    return newRestaurant.toObject();
  }

  async updateRestaurant(restaurantId: Types.ObjectId, dto: UpdateRestaurantDto): Promise<RestaurantDocument>  {

    const updatedRestaurant = await this.restaurantModel.findOneAndUpdate(
      {
        _id: restaurantId,
        isActive: true
      },
      { $set: dto }, // Cần có whitelist trong validation các trường được update
      { new: true } // Return the updated document
    ).lean().exec();
    if ( !updatedRestaurant )
      throw new NotFoundException(Restaurant.name, restaurantId);

    return updatedRestaurant;
  }

  async getRestaurantDetails(restaurantId: Types.ObjectId): Promise<Restaurant & {  isOpen: Boolean }> {

    const restaurant = await this.restaurantModel.findById(restaurantId).lean().exec();
    if ( !restaurant )
      throw new NotFoundException(Restaurant.name, restaurantId);

    // Check if restaurant is open
    const isOpened = await this.redis.get(`restaurant_opened:${restaurantId}`);

    return { ...restaurant , isOpen: !!isOpened };
  }

  async openOrCloseRestaurant(restaurantId: Types.ObjectId, isOpen: boolean): Promise<Boolean> {
    const isOpened = await this.redis.get(`restaurant_opened:${restaurantId}`);
    if ( isOpen && isOpened ) return true
    if ( !isOpen && !isOpened ) return true
    if ( !isOpen && isOpened ) {
      await this.redis.del(`restaurant_opened:${restaurantId}`);
      return true;
    }

    const restaurant = await this.restaurantModel.findOne(
      {
        _id: restaurantId,
        isActive: true
      }
    ).lean().exec();
    
    if ( !restaurant )
      throw new NotFoundException(Restaurant.name, restaurantId);

    // Open to end of day, or until owner close
    const ttl = TimeUtil.getTtlUntilEndOfDay()
    await this.redis.set(
      `restaurant_opened:${restaurantId}`, 
      JSON.stringify(restaurant)
      , 'EX', ttl
    );
    return true;
  }

  async getListRestaurantsByUserId(userId: Types.ObjectId): Promise<Object | null> {

    // Fillter in staff 
    const select = ["-__v", "-ownerId"].join(" ")
    const staffSelect = ["-__v", "-restaurantId"].join(" ")
    const roleAndRestaurant = await this.staffModel.find({ userId: new Types.ObjectId(userId) })
                  .populate({
                    path: "restaurantId",
                    select
                  })
                  .select(staffSelect)
                  .lean()
                  .exec();

    // Group staff trong code vì dữ liệu nhỏ đơn giản
    const staffGroup = roleAndRestaurant.reduce((acc, cur) => {
      const value = acc[cur.role] || []
      acc[cur.role] = [...value, cur]
      return acc
    }, {})
    return staffGroup
  }

  findAllItemsByRestaurantId(restaurantId: Types.ObjectId): Promise<MenuItem[]> {
    return this.menuItemModel.find({ restaurantId }).lean().exec();
  }

  async createNewItem(dto: CreateItemDto): Promise<MenuItem> {

    const { restaurantId, name: itemName, stock_quantity, status } = dto

    // Validate stock_quantity
    if ( stock_quantity === 0 && status === ITEMSTATUS.AVAILABLE ) 
      dto.status = ITEMSTATUS.UNAVAILABLE;


    // Check duplicate item name in restaurant
    const existingItem = await this.menuItemModel.findOne({
      restaurantId: new Types.ObjectId(restaurantId),
      name: itemName
    }).lean().exec();
    if ( existingItem ) 
      throw new ConflictException(ERROR_CODE.CONFLICT_ERROR, `Item already exists in this restaurant.`, dto);

    // Create new item
    const newItem = await this.menuItemModel.create({
      ...dto,
      restaurantId: new Types.ObjectId(restaurantId),
      isActive: true
    })

    return newItem.toObject();
  }

  async getListMenuItemsByRestaurantId(restaurantId: Types.ObjectId): Promise<MenuItemsOut> 
  {
    const items = await this.menuItemModel.aggregate([
      // Lọc
      { $match: { restaurantId: restaurantId } }
      // Sort theo createAt
      , { $sort: { createdAt: 1 }} 
      // Group theo isActive
      , { $group: {
          _id: "$isActive",
          items: { $push: { 
            _id: "$_id",
            name: "$name",
            description: "$description",
            price: "$price",
            image: "$image",
            category: "$category",
            unit: "$unit",
            stock_quantity: "$stock_quantity",
            status: "$status",
            createdAt: "$createdAt",
            updatedAt: "$updatedAt",
            isActive: "$isActive"
          }}
        } 
      },
      // Sort theo isActive true -> false
      { $sort: { _id: -1 } }
    ]).exec();

    const output = items.reduce((acc, cur) => {
      if ( cur._id ) {
        acc.active = cur.items;
      } else {
        acc.inactive = cur.items;
      }
      acc.totalItems += cur.items.length;
      return acc;
    }, { active: [], inactive: [], totalItems: 0 });

    return output;
  }


  // Table Services
  async createTable(dto: CreateTableDto): Promise<TableDocument> {

    const { restaurantId } = dto;

    // Check duplicate table number on the same floor in restaurant
    const existingTable = await this.tableModel.findOne({
      restaurantId: new Types.ObjectId(restaurantId),
      floor: dto.floor,
      number: dto.number
    }).lean().exec();
    if ( existingTable )
      throw new ConflictException(ERROR_CODE.CONFLICT_ERROR, `Table already exists`, dto);
    // Create new table
    const newTable = await this.tableModel.create({
      ...dto,
      restaurantId: new Types.ObjectId(restaurantId)
    }) ;
      
    return newTable.toObject();
  }

  // Get list tables by restaurantId
  async getListTablesByRestaurantId(restaurantId: Types.ObjectId): Promise<TableDocument[]> {
    const select = ["-__v", "-restaurantId"].join(" ")
    const tables = await this.tableModel.find(
      { restaurantId }
    ).select(select).lean().exec();
    
    return tables;
  }

  // Staff Services
  async createStaff(dto: CreateStaffDto): Promise<StaffDocument> {

    const { userId, restaurantId  } = dto

    // Create new staff
    const newStaff = await this.staffModel.create({
      ...dto,
      restaurantId: new Types.ObjectId(restaurantId),
      userId: userId ? new Types.ObjectId(userId) : undefined,
      isActive: false // Mặc định tạo nhân viên là inactive, chờ owner kích hoạt
    })

    return newStaff.toObject();
  }

  async getListStaffsByRestaurantId(restaurantId: Types.ObjectId): Promise<StaffDocument[]> {
    // Fillter in staff
    const select = ["-__v", "-restaurantId"].join(" ")
    const staffs = await this.staffModel.find(
      { restaurantId }
    ).select(select).lean().exec();

    return staffs;
  }

  async activeOrDeactiveStaff(activitorId: Types.ObjectId, staffId: Types.ObjectId): Promise<StaffDocument> {

    //  Find staff
    const select = ["ownerId"].join(" ")
    const staff = await this.staffModel.findById(staffId)
    .populate({
      path: "restaurantId",
      select
    })
    .exec();

    // Validate staff
    if ( !staff )
      throw new NotFoundException(Staff.name, staffId);

    // Check permission
    const restaurant: any = staff.restaurantId;
    if ( restaurant.ownerId !== activitorId )
      throw new ForbiddenException(
        ERROR_CODE.FORBIDDEN, 
        "You do not have permission to perform this action"
      );

    // Update isActive
    staff.isActive = !staff.isActive;
    await staff.save();

    return staff.toObject();
  }

}