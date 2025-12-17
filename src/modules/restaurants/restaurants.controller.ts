import { Controller, Get, Post, Body, Param} from '@nestjs/common';
import { MenuItemsOut, RestaurantsService } from './restaurants.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { Roles } from 'src/common/decorator/roles.decorator';
import { Role } from 'src/common/enums/roles.enum';
import { UserDocument } from '../auths/schema/user.schema';
import { Protected, UserSession, User } from 'src/common/decorator'
import { UserHeaderRequest } from 'src/common/guards/jwt/jwt.guard';
import { CreateItemDto } from './dto/create-item.dto';
import { Types } from 'mongoose';
import { CreateTableDto } from './dto/create-table.dto';
import { TableDocument } from './schemas/table.schema';
import { CreateStaffDto } from './dto/create-staff.dto';


@Controller('restaurants')
export class RestaurantsController {
  constructor(
    private readonly restaurantsService: RestaurantsService
  ) {}

  @Post()
  @Protected()
  @Roles( Role.CUSTOMER, Role.ADMIN, Role.USER )
  create(@Body() createRestaurantDto: CreateRestaurantDto, @UserSession() session: UserHeaderRequest) {
    return this.restaurantsService.create(session, createRestaurantDto);
  }

  @Get("my-restaurants")
  @Protected()
  @Roles( Role.CUSTOMER, Role.ADMIN )
  findMyRestaurants(@User() user: UserDocument) {
    return this.restaurantsService.getListRestaurantsByUserId(user._id);
  }

  // Menu Items
  @Post("/item")
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER)
  createMenuItem(@Body() createItemDto: CreateItemDto): Promise<any> {
    
    return this.restaurantsService.createNewItem(createItemDto);
  }

  @Get("/:id/items")
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER, Role.CUSTOMER )
  findMenuItemsByRestaurantId(@Param("id") restaurantId: string): Promise<MenuItemsOut> {
    return this.restaurantsService.getListMenuItemsByRestaurantId(restaurantId);
  }


  // Tables
  @Post("/table")
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER)
  createTable(@Body() createTableDto: CreateTableDto): Promise<TableDocument> {
    return this.restaurantsService.createTable(createTableDto);
  }

  @Get("/:id/tables")
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER, Role.CUSTOMER )
  findTablesByRestaurantId(@Param("id") restaurantId: string): Promise<TableDocument[]> {
    return this.restaurantsService.getListTablesByRestaurantId(restaurantId);
  }

  // Staffs
  @Get("/:id/staffs")
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER )
  findStaffsByRestaurantId(@Param("id") restaurantId: string): Promise<any[]> {
    return this.restaurantsService.getListStaffsByRestaurantId(restaurantId);
  }

  @Post("/staff")
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER)
  createStaff(@Body() createStaffDto: CreateStaffDto): Promise<any> {
    return this.restaurantsService.createStaff(createStaffDto);
  }

  @Post("/staff/:id/activate")
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER)
  activateStaff(@Param("id") staffId: string, @User() user: UserDocument): Promise<any> {
    return this.restaurantsService.activeOrDeactiveStaff(user._id.toString(), staffId);
  }

  // // item 

  // @Get("/:id/items")
  // findAllItems(@Param("id") restaurantId: string) {
  //   return this.restaurantsService.findAllItemsByRestaurantId(restaurantId);
  // }

  // @Post("/:id/new-item")
  // @UseGuards( JwtGuard )
  // @Roles( Role.ADMIN )
  // createNewItem(@Body() createItemDto: CreateItemDto, @Param("id") restaurantId: string) {
  //   return this.restaurantsService.createNewItem(restaurantId, createItemDto);
  // }

}
