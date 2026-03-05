import { IsEnum, IsMongoId } from "class-validator";
import { OrderStatus } from "../schemas/order.schema";
import { Types } from "mongoose";
import { Type } from "class-transformer";

export class ChangeOrderStatusDto {
    @IsMongoId()
    @Type(() => Types.ObjectId)
    orderId: Types.ObjectId;

    @IsEnum(OrderStatus)
    status: OrderStatus;
}   