import { IsEnum, IsOptional, IsString } from "class-validator";

export class CreateItemDto {

    @IsString() 
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsString()
    price: string;

    @IsOptional()
    @IsString()
    imageUrl?: string;

    @IsEnum(["food", "drink", "other"])
    category: string;

}