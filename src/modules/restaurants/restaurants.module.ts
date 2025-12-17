import { Module } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsController } from './restaurants.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { RestaurantSchema } from './schemas/restaurant.schema';
import { MenuItemSchema } from './schemas/menu-items.schema';
import { Staff, StaffSchema } from './schemas/staff.schema';
import { User, UserSchema } from '../auths/schema/user.schema';
import { TABLE_NAME, TableSchema } from './schemas/table.schema';

@Module({
  controllers: [RestaurantsController],
  providers: [
    RestaurantsService,
  ],
  imports: [
    MongooseModule.forFeature([
      { name: "Restaurant", schema: RestaurantSchema },
      { name: "MenuItem", schema: MenuItemSchema },
      { name: Staff.name, schema: StaffSchema },
      { name: User.name, schema: UserSchema },
      { name: TABLE_NAME, schema: TableSchema },
    ]),
  ],
})
export class RestaurantsModule {}
