import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { TABLESTATUS } from "../dto/create-table.dto";

export type TableDocument = HydratedDocument<Table>;

@Schema({ timestamps: true })
class Table {

    @Prop({ required: true, type: Types.ObjectId, ref: "Restaurant" })
    restaurantId: Types.ObjectId

    @Prop({ required: true, trim : true })
    number: string // Naame or number of the table

    @Prop({ required: true, min: 1, default: 1 })
    floor: number

    // Vị trí
    @Prop({ required: true, min: 0, default: 100 })
    x: number
    @Prop({ required: true, min: 0, default: 100 })
    y: number

    @Prop({ required: true, min: 1, max: 20, default: 4 })
    capacity: number // Số chỗ ngồi

    @Prop({ min: 0, default: 0, validate: {
            validator: function (value: number) {   
            return value <= this.capacity;
        },
        message: 'Current capacity cannot exceed total capacity.'
    }})
    currentCapacity: number // Số chỗ ngồi hiện tại 

    @Prop({ required: true, enum: TABLESTATUS, default: TABLESTATUS.AVAILABLE })
    status: TABLESTATUS

    @Prop({ required: true })
    shape: string

    @Prop({ type: Types.ObjectId, ref: "Staff" })
    assignedServer?: Types.ObjectId

    @Prop({ type: Types.ObjectId, ref: "Order" })
    orderId?: Types.ObjectId

}

export const TABLE_NAME = Table.name;

export const TableSchema = SchemaFactory.createForClass(Table);

TableSchema.index({ restaurantId: 1, floor: 1, number: 1 }, { unique: true });