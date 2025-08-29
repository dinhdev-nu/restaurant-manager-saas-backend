import { InjectModel } from '@nestjs/mongoose';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { Restaurant, RestaurantDocument } from './schemas/restaurant.schema';
import { Model, Types } from 'mongoose';
import { BadRequestException } from 'src/common/exceptions/http-exception';
import { MenuItem, MenuItemDocument } from './schemas/menu-items.schema';
import { CreateItemDto } from './dto/create-item.dto';

export class RestaurantsService {

  constructor (
    @InjectModel(Restaurant.name) private readonly restaurantModel: Model<RestaurantDocument>,
    @InjectModel(MenuItem.name) private readonly menuItemModel: Model<MenuItemDocument>
  ) {}

  create(userId: string, createRestaurantDto: CreateRestaurantDto): Promise<Restaurant> {

    if ( !userId || !Types.ObjectId.isValid(userId) ) {
      throw new BadRequestException('Invalid user ID');
    }

    const newRestaurant = new this.restaurantModel({
      ...createRestaurantDto,
      ownerId: new Types.ObjectId(userId)
    });

    return newRestaurant.save();
  }


  findAllItemsByRestaurantId(restaurantId: string): Promise<MenuItem[]> {
    if (!Types.ObjectId.isValid(restaurantId)) throw new BadRequestException('Invalid restaurant ID');

    return this.menuItemModel.find({ restaurantId: new Types.ObjectId(restaurantId) }).lean().exec();
  }

  createNewItem(restaurantId: string, createItemDto: CreateItemDto): Promise<MenuItem> {

    if ( !Types.ObjectId.isValid(restaurantId) ) {
      throw new BadRequestException('Invalid restaurant ID');
    }

    const newItem = new this.menuItemModel({
      restaurantId: new Types.ObjectId(restaurantId),
      ...createItemDto
    });

    return newItem.save();
  }

}
