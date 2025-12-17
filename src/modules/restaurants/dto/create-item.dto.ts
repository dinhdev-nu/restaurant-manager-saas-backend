import { IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { ITEMSTATUS } from "../schemas/menu-items.schema";

export class CreateItemDto {

    @IsMongoId({ message: 'ID nhà hàng không hợp lệ' })
    @IsString()
    restaurantId: string;

    @IsString()
    @MinLength(2)
    @MaxLength(30)
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsNumber()
    @Min(0)
    price: number;

    @IsOptional()
    @IsString()
    image?: string;

    @IsString()
    category: string;

    @IsString()
    unit: string;

    @IsNumber()
    @Min(0)
    @Max(10000)
    stock_quantity: number;

    @IsEnum(ITEMSTATUS, { message: 'Trạng thái món ăn không hợp lệ' })
    status: ITEMSTATUS;

}