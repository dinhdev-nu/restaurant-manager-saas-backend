import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer"

export class CreateOrderDto {

    @IsString()
    restaurantId: string;

    @ValidateNested({ each: true })
    @Type(() => ItemDto)
    items: ItemDto[];

    @IsNumber()
    @Min(1)
    totalAmount: number;

    @IsEnum(['pending', 'preparing', 'served', 'completed', 'cancelled' ])
    status: string;

    @IsOptional()
    @IsEnum(['credit_card', 'paypal', 'cash'])
    paymentMethod: string;

    @IsOptional()
    @IsBoolean()
    isPaid: boolean;

}


class ItemDto {
    @IsString()
    itemId: string;

    @IsInt()
    @Min(1)
    quantity: number;

    @IsNumber()
    @Min(1)
    price: number;

}