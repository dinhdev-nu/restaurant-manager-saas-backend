import { Controller, Get, Post, Body, Param, Put} from '@nestjs/common';
import { MenuItemsOut, RestaurantService } from './restaurant.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UserDocument } from '../auth/schema/user.schema';
import { CreateItemDto } from './dto/create-item.dto';
import { CreateTableDto } from './dto/create-table.dto';
import { TableDocument } from './schemas/table.schema';
import { CreateStaffDto } from './dto/create-staff.dto';
import { ParseObjectIdPipe } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { CurrentUser, Roles } from 'src/common/decorators';
import { ROLE } from 'src/common/constants/role.constant';
import { UserHeaderRequest } from '../auth/auth.types';


@Controller('restaurants')
export class RestaurantController {
  constructor(
    private readonly restaurantService: RestaurantService
  ) {}

  @Post()
  create(@Body() dto: CreateRestaurantDto, @CurrentUser() user: UserHeaderRequest) {
    return this.restaurantService.create(user, dto);
  }

  @Post("/:id/open")
  @Roles( ROLE.ADMIN, ROLE.USER )
  openRestaurant(@Param("id", ParseObjectIdPipe) restaurantId: Types.ObjectId) {
    return this.restaurantService.openOrCloseRestaurant(restaurantId, true);
  }
  @Post('/:id/close')
  @Roles( ROLE.ADMIN, ROLE.USER )
  closeRestaurant(@Param("id", ParseObjectIdPipe) restaurantId: Types.ObjectId) {
    return this.restaurantService.openOrCloseRestaurant(restaurantId, false);
  }

  @Put("/:id")
  @Roles( ROLE.ADMIN, ROLE.USER )
  updateRestaurant(@Param("id", ParseObjectIdPipe) restaurantId: Types.ObjectId, @Body() dto: CreateRestaurantDto) {
    return this.restaurantService.updateRestaurant(restaurantId, dto);
  }

  @Get("my-restaurants")
  @Roles( ROLE.ADMIN, ROLE.USER )
  findMyRestaurants(@CurrentUser('ID') id: Types.ObjectId) {
    return this.restaurantService.getListRestaurantsByUserId(id);
  }

  @Get("/detail/:id")
  getRestaurantDetails(@Param("id", ParseObjectIdPipe) restaurantId: Types.ObjectId) {
    return this.restaurantService.getRestaurantDetails(restaurantId);
  }

  // Menu Items
  @Post("/item")
  @Roles( ROLE.ADMIN, ROLE.USER )
  createMenuItem(@Body() dto: CreateItemDto): Promise<any> {
    
    return this.restaurantService.createNewItem(dto);
  }

  @Get("/:id/items")
  findMenuItemsByRestaurantId(@Param("id", ParseObjectIdPipe) restaurantId: Types.ObjectId): Promise<MenuItemsOut> {
    return this.restaurantService.getListMenuItemsByRestaurantId(restaurantId);
  }


  // Tables
  @Post("/table")
  @Roles( ROLE.ADMIN, ROLE.USER )
  createTable(@Body() dto: CreateTableDto): Promise<TableDocument> {
    return this.restaurantService.createTable(dto);
  }

  @Get("/:id/tables")
  findTablesByRestaurantId(@Param("id", ParseObjectIdPipe) restaurantId: Types.ObjectId): Promise<TableDocument[]> {
    return this.restaurantService.getListTablesByRestaurantId(restaurantId);
  }

  // Staffs
  @Get("/:id/staffs")
  @Roles( ROLE.ADMIN, ROLE.USER)
  findStaffsByRestaurantId(@Param("id", ParseObjectIdPipe) restaurantId: Types.ObjectId): Promise<any[]> {
    return this.restaurantService.getListStaffsByRestaurantId(restaurantId);
  }

  @Post("/staff")
  @Roles( ROLE.ADMIN, ROLE.USER)
  createStaff(@Body() dto: CreateStaffDto): Promise<any> {
    return this.restaurantService.createStaff(dto);
  }

  @Post("/staff/:id/activate")
  @Roles( ROLE.ADMIN, ROLE.USER)
  activateStaff(@Param("id", ParseObjectIdPipe) staffId: Types.ObjectId, @CurrentUser('ID') userId: Types.ObjectId){
    return this.restaurantService.activeOrDeactiveStaff(userId, staffId);
  }

  // // item 

  // @Get("/:id/items")
  // findAllItems(@Param("id", ParseObjectIdPipe) restaurantId: Types.ObjectId) {
  //   return this.restaurantService.findAllItemsByRestaurantId(restaurantId);
  // }

  // @Post("/:id/new-item")
  // @UseGuards( JwtGuard )
  // @Roles( Role.ADMIN )
  // createNewItem(@Body() createItemDto: CreateItemDto, @Param("id", ParseObjectIdPipe) restaurantId: Types.ObjectId) {
  //   return this.restaurantService.createNewItem(restaurantId, createItemDto);
  // }

}
