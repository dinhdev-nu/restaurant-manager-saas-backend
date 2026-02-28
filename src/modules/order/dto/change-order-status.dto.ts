import { IsEnum, IsMongoId } from "class-validator";
import { OrderStatus } from "../schemas/order.schema";

export class ChangeOrderStatusDto {
    @IsMongoId()
    orderId: string;

    @IsEnum(OrderStatus)
    status: OrderStatus;
}   