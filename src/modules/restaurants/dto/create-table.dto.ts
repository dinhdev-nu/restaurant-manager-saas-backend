import { IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";


export enum TABLESTATUS {
    AVAILABLE = "available",
    OCCUPIED = "occupied",
    RESERVED = "reserved",
    CLEANING = "cleaning",
}

export class CreateTableDto {

    @IsMongoId({ message: 'ID nhà hàng không hợp lệ' })
    @IsString()
    restaurantId: string;

    @IsString()
    @MaxLength(10)
    number: string; 

    @IsNumber()
    @Min(1)
    @Max(10)
    floor: number;

    @IsNumber()
    @Min(0)
    x: number;
    @IsNumber()
    @Min(0)
    y: number;

    @IsString()
    @IsEnum(["rectangular", "circular"])
    shape: string;

    @IsNumber()
    @Min(1)
    @Max(20)
    capacity: number;

    @IsString()
    @IsEnum(TABLESTATUS)
    status: TABLESTATUS;

}