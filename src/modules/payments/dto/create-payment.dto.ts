import { IsEnum, IsMongoId, IsNumber, IsString, Min } from "class-validator";
import { PaymentMethod } from "../schemas/payment.schema";

export class CreatePaymentByCashDto {

    @IsMongoId()
    restaurantId: string;

    @IsMongoId()
    orderId: string;

    @IsNumber()
    @Min(0)
    paidAmount: number;

    @IsEnum(PaymentMethod)
    method: PaymentMethod;

}

export class CreatePaymentDto {

    @IsMongoId()
    restaurantId: string;

    @IsMongoId()
    orderId: string;

    @IsNumber()
    @Min(0)
    amount: number;

    @IsEnum(PaymentMethod)
    method: PaymentMethod;

}
