import { IsEnum, IsMongoId, IsNumber, IsString, Min } from "class-validator";
import { PaymentMethod } from "../schemas/payment.schema";
import { Types } from "mongoose";
import { Type } from "class-transformer";

export class CreatePaymentByCashDto {

    @IsMongoId()
    @Type(() => Types.ObjectId)
    restaurantId: Types.ObjectId;

    @IsMongoId()
    @Type(() => Types.ObjectId)
    orderId: Types.ObjectId;

    @IsNumber()
    @Min(0)
    paidAmount: number;

    @IsEnum(PaymentMethod)
    method: PaymentMethod;

}

export class CreatePaymentDto {

    @IsMongoId()
    @Type(() => Types.ObjectId)
    restaurantId: Types.ObjectId;

    @IsMongoId()
    @Type(() => Types.ObjectId)
    orderId: Types.ObjectId;

    @IsNumber()
    @Min(0)
    amount: number;

    @IsEnum(PaymentMethod)
    method: PaymentMethod;

}
