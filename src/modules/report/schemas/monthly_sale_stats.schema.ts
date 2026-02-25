import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { ItemSaleStats } from "./daily_sale_stats.schema";


export type MonthlySaleStatsDocument = HydratedDocument<MonthlySaleStats>

@Schema({ timestamps: true })
export class MonthlySaleStats {

    @Prop({ type: Types.ObjectId, required: true, ref: "Restaurant"})
    restaurantId: Types.ObjectId

    @Prop({ min: 0, required: true })
    totalRevenue: number;

    @Prop({ min: 0, required: true })
    totalOrders: number;

    @Prop({ min: 0, required: true })
    totalItemsSold: number;

    @Prop({ type: [ItemSaleStats], default: [], required: true })
    topItemsSold: ItemSaleStats[];

}

export const MonthlySaleStatsSchema = SchemaFactory.createForClass(MonthlySaleStats)