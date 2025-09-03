import { Type } from "@nestjs/common";
import { IsEnum, IsNumber, IsString } from "class-validator";

export class CreatePaymentByCashDto {

    @IsString()
    orderId: string;

    @IsNumber()
    amount: number;

    @IsString()
    method: string;

}

export class CreatePaymentDto {

    @IsString()
    orderId: string;

    @IsEnum(['credit_card', 'paypal', 'bank_transfer', 'cash'])
    method: string;

}
