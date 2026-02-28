import { ArrayMinSize, IsEnum, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer"
import { OrderStatus } from "../schemas/order.schema";


class ItemDto {
    @IsString()
    itemId: string;

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
    customerId?: string;
    @IsString()
    name: string;
    @IsString()
    contact: string;
}

export class CreateOrderDto {

    @IsOptional()
    @IsMongoId()
    _id?: string;

    @IsMongoId()
    restaurantId: string;

    @IsString()
    table: string;

    @IsMongoId()
    @IsOptional()
    staffId?: string;

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
