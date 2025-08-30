import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { Roles } from 'src/common/decorator/roles.decorator';
import { JwtGuard } from 'src/common/guards/jwt/jwt.guard';
import { Role } from 'src/common/enums/roles.enum';
import { User } from 'src/common/decorator/user.decorator';
import { CreateItemDto } from './dto/create-item.dto';


@Controller('restaurants')
export class RestaurantsController {
  constructor(
    private readonly restaurantsService: RestaurantsService
  ) {}

  // restaurant

  @Post()
  @UseGuards( JwtGuard )
  @Roles( Role.ADMIN )
  create(@Body() createRestaurantDto: CreateRestaurantDto, @User() user: any) {
    const userId = user['id'];
    return this.restaurantsService.create( userId, createRestaurantDto);
  }

  // item 

  @Get("/:id/items")
  findAllItems(@Param("id") restaurantId: string) {
    return this.restaurantsService.findAllItemsByRestaurantId(restaurantId);
  }

  @Post("/:id/new-item")
  @UseGuards( JwtGuard )
  @Roles( Role.ADMIN )
  createNewItem(@Body() createItemDto: CreateItemDto, @Param("id") restaurantId: string) {
    return this.restaurantsService.createNewItem(restaurantId, createItemDto);
  }

}
