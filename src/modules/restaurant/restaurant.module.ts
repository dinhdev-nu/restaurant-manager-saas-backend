import { Module } from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { RestaurantController } from './restaurant.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { RestaurantSchema } from './schemas/restaurant.schema';
import { MenuItemSchema } from './schemas/menu-items.schema';
import { Staff, StaffSchema } from './schemas/staff.schema';
import { TABLE_NAME, TableSchema } from './schemas/table.schema';
import { User, UserSchema } from '../auth/schema/user.xxx.schema';

@Module({
  controllers: [RestaurantController],
  providers: [
    RestaurantService,
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
export class RestaurantModule {}
