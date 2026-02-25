import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types, HydratedDocument } from "mongoose";

export type DailySaleStatsDocument = HydratedDocument<DailySaleStats>;

@Schema({ _id: false , timestamps: false })
export class ItemSaleStats {
    @Prop({ type: Types.ObjectId, required: true, ref: 'MenuItem' })
    itemId: Types.ObjectId;
    @Prop({ required: true })
    name: string;
    @Prop({ min: 0, required: true })
    totalRevenue: number;
    @Prop({ min: 0, required: true })
    quantitySold: number;
}



@Schema({ timestamps: true })
export class DailySaleStats {
    @Prop({ type: Types.ObjectId, required: true, ref: 'Restaurant' })
    restaurantId: Types.ObjectId;

    @Prop({ min: 0, required: true })
    totalRevenue: number;

    @Prop({ min: 0, required: true })
    totalOrders: number;

    @Prop({ min: 0, required: true })
    totalItemsSold: number;

    @Prop({ type: [ItemSaleStats], default: [], required: true })
    topItemsSold: ItemSaleStats[];
}

export const DailySaleStatsSchema = SchemaFactory.createForClass(DailySaleStats);