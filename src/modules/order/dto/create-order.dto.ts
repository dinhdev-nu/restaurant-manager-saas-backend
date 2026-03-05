import { ArrayMinSize, IsEnum, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer"
import { OrderStatus } from "../schemas/order.schema";
import { Types } from "mongoose";


class ItemDto {
    @IsMongoId()
    @Type(() => Types.ObjectId)
    itemId: Types.ObjectId;

    @IsString()
    name: string; 

    @IsInt()
    @Min(1)
    quantity: number;

    @IsNumber()
    @Min(0)
    price: number;

    @IsOptional()
    @IsString()
    note?: string;
}

class CustomerDto {
    @IsOptional()
    @IsMongoId()
    @Type(() => Types.ObjectId)
    customerId?: Types.ObjectId;
    @IsString()
    name: string;
    @IsString()
    contact: string;
}

export class CreateOrderDto {

    @IsOptional()
    @IsMongoId()
    @Type(() => Types.ObjectId)
    _id?: Types.ObjectId;

    @IsMongoId()
    @Type(() => Types.ObjectId)
    restaurantId: Types.ObjectId;

    @IsString()
    table: string;

    @IsMongoId()
    @IsOptional()
    @Type(() => Types.ObjectId)
    staffId?: Types.ObjectId;

    @IsString()
    staff: string;

    @IsEnum(OrderStatus)
    status: OrderStatus;

    @IsOptional()
    @ValidateNested()
    @Type(() => CustomerDto)
    customer?: CustomerDto;

    @ValidateNested({ each: true })
    @Type(() => ItemDto)
    @ArrayMinSize(1)
    items: ItemDto[];

    @IsNumber()
    @Min(1)
    subtotal: number;

    @IsNumber()
    @Min(0)
    tax: number;

    @IsNumber()
    @Min(0)
    discount: number;

    @IsNumber()
    @Min(0)
    total: number;
}
