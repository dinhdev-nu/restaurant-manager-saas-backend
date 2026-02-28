import { InjectModel } from '@nestjs/mongoose';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { Restaurant, RestaurantDocument } from './schemas/restaurant.schema';
import { Model, Types } from 'mongoose';
import { BadRequestException } from 'src/common/exceptions/http-exception';
import { ITEMSTATUS, MenuItem, MenuItemDocument } from './schemas/menu-items.schema';
import { CreateItemDto } from './dto/create-item.dto';
import { Shift, Staff, StaffDocument } from './schemas/staff.schema';
import { RestaurantRole, Role } from 'src/common/enums/roles.enum';
import { User, UserDocument } from '../auths/schema/user.schema';
import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from 'src/common/constants/redis.const';
import Redis from 'ioredis';
import { UserHeaderRequest } from 'src/common/guards/jwt/jwt.guard';
import { TABLE_NAME, TableDocument } from './schemas/table.schema';
import { CreateTableDto } from './dto/create-table.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { getTtlUntilEndOfDay } from 'src/common/utils/time.util';

export interface MenuItemsOut {
  active: MenuItem[];
  inactive: MenuItem[];
  totalItems: number;
}

@Injectable()
export class RestaurantsService {

  constructor (
    @InjectModel(Restaurant.name) private readonly restaurantModel: Model<RestaurantDocument>,
    @InjectModel(MenuItem.name) private readonly menuItemModel: Model<MenuItemDocument>,
    @InjectModel(Staff.name) private readonly staffModel: Model<StaffDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(TABLE_NAME) private readonly tableModel: Model<TableDocument>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  async create(session: UserHeaderRequest, createRestaurantDto: CreateRestaurantDto): Promise<RestaurantDocument> {

    const { info: user } = session;
    // Kiểm tra nhà hàng tạo 1 lần nữa thì trả về lựa chọn là cở sở 2 hay gì đó
  
    const newRestaurant = await this.restaurantModel.create({
      ...createRestaurantDto,
      ownerId: new Types.ObjectId(user._id)
    });

    // Update User role 
    if ( !user.roles.includes(Role.CUSTOMER) ) {
      // Update value session in redis
      const newRoles = [...user.roles, Role.CUSTOMER]
      const updateSession = {
        ...session,
        info: {...user, roles: newRoles},
        ATPayload: {...session.ATPayload, roles: newRoles}
      } as UserHeaderRequest
      const ttl = await this.redis.ttl(`auth:${user._id}:${session.session.sid}`)
      await Promise.all([
        this.redis.set(`auth:${user._id}:${session.session.sid}`, JSON.stringify(updateSession), 'EX', ttl),
        this.userModel.updateOne(
          { _id: user._id},
          { $addToSet: { roles: Role.CUSTOMER}}
        ).exec()
      ])
    }

    
    // Create a owner
    const { email, phone, user_name, avatar } = user;
    await this.staffModel.create({
      userId: new Types.ObjectId(user._id),
      restaurantId: newRestaurant._id,
      name: user_name,
      email,
      phone,
      avatar,
      role: RestaurantRole.OWNER,
      shift: Shift.FULLTIME,
      workingHours: "24h",
      joinDate: new Date(),
      salary: 0,
    })
    
    return newRestaurant.toObject();
  }

  async updateRestaurant(restaurantId: string, updateRestaurantDto: UpdateRestaurantDto): Promise<RestaurantDocument>  {
    if ( !Types.ObjectId.isValid(restaurantId) )
      throw new BadRequestException('Invalid restaurant ID');

    const objId = new Types.ObjectId(restaurantId);

    const updatedRestaurant = await this.restaurantModel.findOneAndUpdate(
      {
        _id: objId,
        isActive: true
      },
      { $set: updateRestaurantDto }, // Cần có whitelist trong validation các trường được update
      { new: true } // Return the updated document
    ).lean().exec();
    if ( !updatedRestaurant )
      throw new BadRequestException('Restaurant not found or inactive');

    return updatedRestaurant;
  }

  async getRestaurantDetails(restaurantId: string): Promise<Restaurant & {  isOpen: Boolean }> {
    if ( !Types.ObjectId.isValid(restaurantId) )
      throw new BadRequestException('Invalid restaurant ID');

    const objId = new Types.ObjectId(restaurantId);
    const restaurant = await this.restaurantModel.findById(objId).lean().exec();
    if ( !restaurant )
      throw new BadRequestException('Restaurant not found');

    // Check if restaurant is open
    const isOpened = await this.redis.get(`restaurant_opened:${restaurantId}`);

    return { ...restaurant , isOpen: !!isOpened };
  }

  async openOrCloseRestaurant(restaurantId: string, isOpen: boolean): Promise<Boolean> {
    if ( !Types.ObjectId.isValid(restaurantId) )
      throw new BadRequestException('Invalid restaurant ID');

    const objId = new Types.ObjectId(restaurantId);

    const isOpened = await this.redis.get(`restaurant_opened:${restaurantId}`);
    if ( isOpen && isOpened ) return true
    if ( !isOpen && !isOpened ) return true
    if ( !isOpen && isOpened ) {
      await this.redis.del(`restaurant_opened:${restaurantId}`);
      return true;
    }

    const restaurant = await this.restaurantModel.findOne(
      {
        _id: objId,
        isActive: true
      }
    ).lean().exec();
    
    if ( !restaurant )
      throw new BadRequestException('Restaurant not found or inactive');

    // Open to end of day, or until owner close
    const ttl = getTtlUntilEndOfDay()
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

  findAllItemsByRestaurantId(restaurantId: string): Promise<MenuItem[]> {
    if (!Types.ObjectId.isValid(restaurantId)) throw new BadRequestException('Invalid restaurant ID');

    return this.menuItemModel.find({ restaurantId: new Types.ObjectId(restaurantId) }).lean().exec();
  }

  async createNewItem(createItemDto: CreateItemDto): Promise<MenuItem> {

    const { restaurantId, name: itemName, stock_quantity, status } = createItemDto

    // Validate stock_quantity
    if ( stock_quantity === 0 && status === ITEMSTATUS.AVAILABLE ) 
      createItemDto.status = ITEMSTATUS.UNAVAILABLE;


    // Check duplicate item name in restaurant
    const existingItem = await this.menuItemModel.findOne({
      restaurantId: new Types.ObjectId(restaurantId),
      name: itemName
    }).lean().exec();
    if ( existingItem ) 
      throw new BadRequestException(`Menu item with name '${itemName}' already exists in this restaurant.`);

    // Create new item
    const newItem = await this.menuItemModel.create({
      ...createItemDto,
      restaurantId: new Types.ObjectId(restaurantId),
      isActive: true
    })

    return newItem.toObject();
  }

  async getListMenuItemsByRestaurantId(restaurantId: string): Promise<MenuItemsOut> 
  {

    if ( !restaurantId || !Types.ObjectId.isValid(restaurantId) )
      throw new BadRequestException('Invalid restaurant ID');

    // }).select(select).lean().exec();
    const items = await this.menuItemModel.aggregate([
      // Lọc
      { $match: { restaurantId: new Types.ObjectId(restaurantId) } }
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
  async createTable(createTableDto: CreateTableDto): Promise<TableDocument> {

    const { restaurantId } = createTableDto;

    // Check duplicate table number on the same floor in restaurant
    const existingTable = await this.tableModel.findOne({
      restaurantId: new Types.ObjectId(restaurantId),
      floor: createTableDto.floor,
      number: createTableDto.number
    }).lean().exec();
    if ( existingTable )
      throw new BadRequestException(
        `Table with number '${createTableDto.number}' already exists on floor ${createTableDto.floor} in this restaurant.`
      );

    // Create new table
    const newTable = await this.tableModel.create({
      ...createTableDto,
      restaurantId: new Types.ObjectId(restaurantId)
    }) ;
      

    return newTable.toObject();
  }

  // Get list tables by restaurantId
  async getListTablesByRestaurantId(restaurantId: string): Promise<TableDocument[]> {
    if ( !Types.ObjectId.isValid(restaurantId) )
      throw new BadRequestException('Invalid restaurant ID');

    const select = ["-__v", "-restaurantId"].join(" ")
    const tables = await this.tableModel.find(
      { restaurantId: new Types.ObjectId(restaurantId) }
    ).select(select).lean().exec();
    
    return tables;
  }

  // Staff Services
  async createStaff(createStaffDto: CreateStaffDto): Promise<StaffDocument> {

    const { userId, restaurantId  } = createStaffDto

    // Create new staff
    const newStaff = await this.staffModel.create({
      ...createStaffDto,
      restaurantId: new Types.ObjectId(restaurantId),
      userId: userId ? new Types.ObjectId(userId) : undefined,
      isActive: false // Mặc định tạo nhân viên là inactive, chờ owner kích hoạt
    })

    return newStaff.toObject();
  }

  async getListStaffsByRestaurantId(restaurantId: string): Promise<StaffDocument[]> {

    // Validate restaurantId
    if ( !Types.ObjectId.isValid(restaurantId) )
      throw new BadRequestException('Invalid restaurant ID');

    // Fillter in staff
    const select = ["-__v", "-restaurantId"].join(" ")
    const staffs = await this.staffModel.find(
      { restaurantId: new Types.ObjectId(restaurantId) }
    ).select(select).lean().exec();

    return staffs;
  }

  async activeOrDeactiveStaff(activitorId: string, staffId: string): Promise<StaffDocument> {

    //  Finf staff
    const select = ["ownerId"].join(" ")
    const staff = await this.staffModel.findById(staffId)
    .populate({
      path: "restaurantId",
      select
    })
    .exec();

    // Validate staff
    if ( !staff )
      throw new BadRequestException('Staff not found');

    // Check permission
    const restaurant: any = staff.restaurantId;
    if ( restaurant.ownerId.toString() !== activitorId )
      throw new BadRequestException('You do not have permission to activate/deactivate this staff');

    // Update isActive
    staff.isActive = !staff.isActive;
    await staff.save();

    return staff.toObject();
  }

}