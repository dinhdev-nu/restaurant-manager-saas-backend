import { Controller, Get, Post, Body, Param, Put} from '@nestjs/common';
import { MenuItemsOut, RestaurantService } from './restaurant.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { Roles } from 'src/common/decorator/roles.decorator';
import { Role } from 'src/common/enums/roles.enum';
import { UserDocument } from '../auth/schema/user.schema';
import { Protected, UserSession, User } from 'src/common/decorator'
import { UserHeaderRequest } from 'src/common/guards/jwt/jwt.guard';
import { CreateItemDto } from './dto/create-item.dto';
import { CreateTableDto } from './dto/create-table.dto';
import { TableDocument } from './schemas/table.schema';
import { CreateStaffDto } from './dto/create-staff.dto';


@Controller('restaurants')
export class RestaurantController {
  constructor(
    private readonly restaurantService: RestaurantService
  ) {}

  @Post()
  @Protected()
  @Roles( Role.CUSTOMER, Role.ADMIN, Role.USER )
  create(@Body() createRestaurantDto: CreateRestaurantDto, @UserSession() session: UserHeaderRequest) {
    return this.restaurantService.create(session, createRestaurantDto);
  }

  @Post("/:id/open")
  @Protected()
  @Roles( Role.CUSTOMER, Role.ADMIN )
  openRestaurant(@Param("id") restaurantId: string) {
    return this.restaurantService.openOrCloseRestaurant(restaurantId, true);
  }
  @Post('/:id/close')
  @Protected()
  @Roles( Role.CUSTOMER, Role.ADMIN )
  closeRestaurant(@Param("id") restaurantId: string) {
    return this.restaurantService.openOrCloseRestaurant(restaurantId, false);
  }

  @Put("/:id")
  @Protected()
  @Roles( Role.CUSTOMER, Role.ADMIN )
  updateRestaurant(@Param("id") restaurantId: string, @Body() updateRestaurantDto: CreateRestaurantDto) {
    return this.restaurantService.updateRestaurant(restaurantId, updateRestaurantDto);
  }

  @Get("my-restaurants")
  @Protected()
  @Roles( Role.CUSTOMER, Role.ADMIN )
  findMyRestaurants(@User() user: UserDocument) {
    console.log("Finding restaurants for user ID:", user._id);
    return this.restaurantService.getListRestaurantsByUserId(user._id);
  }

  @Get("/detail/:id")
  @Protected()
  @Roles( Role.CUSTOMER, Role.ADMIN, Role.USER )
  getRestaurantDetails(@Param("id") restaurantId: string) {
    console.log("Fetching details for restaurant ID:", restaurantId);
    return this.restaurantService.getRestaurantDetails(restaurantId);
  }

  // Menu Items
  @Post("/item")
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER)
  createMenuItem(@Body() createItemDto: CreateItemDto): Promise<any> {
    
    return this.restaurantService.createNewItem(createItemDto);
  }

  @Get("/:id/items")
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER, Role.CUSTOMER )
  findMenuItemsByRestaurantId(@Param("id") restaurantId: string): Promise<MenuItemsOut> {
    return this.restaurantService.getListMenuItemsByRestaurantId(restaurantId);
  }


  // Tables
  @Post("/table")
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER)
  createTable(@Body() createTableDto: CreateTableDto): Promise<TableDocument> {
    return this.restaurantService.createTable(createTableDto);
  }

  @Get("/:id/tables")
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER, Role.CUSTOMER )
  findTablesByRestaurantId(@Param("id") restaurantId: string): Promise<TableDocument[]> {
    return this.restaurantService.getListTablesByRestaurantId(restaurantId);
  }

  // Staffs
  @Get("/:id/staffs")
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER )
  findStaffsByRestaurantId(@Param("id") restaurantId: string): Promise<any[]> {
    return this.restaurantService.getListStaffsByRestaurantId(restaurantId);
  }

  @Post("/staff")
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER)
  createStaff(@Body() createStaffDto: CreateStaffDto): Promise<any> {
    return this.restaurantService.createStaff(createStaffDto);
  }

  @Post("/staff/:id/activate")
  @Protected()
  @Roles( Role.ADMIN, Role.CUSTOMER)
  activateStaff(@Param("id") staffId: string, @User() user: UserDocument): Promise<any> {
    return this.restaurantService.activeOrDeactiveStaff(user._id.toString(), staffId);
  }

  // // item 

  // @Get("/:id/items")
  // findAllItems(@Param("id") restaurantId: string) {
  //   return this.restaurantService.findAllItemsByRestaurantId(restaurantId);
  // }

  // @Post("/:id/new-item")
  // @UseGuards( JwtGuard )
  // @Roles( Role.ADMIN )
  // createNewItem(@Body() createItemDto: CreateItemDto, @Param("id") restaurantId: string) {
  //   return this.restaurantService.createNewItem(restaurantId, createItemDto);
  // }

}
