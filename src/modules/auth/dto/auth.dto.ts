import { IsEmail, IsMobilePhone, IsOptional, IsPhoneNumber, IsString, Length } from "class-validator";

export class RegisterDTO {
    @IsOptional() // This field is optional
    @IsEmail()
    email: string;

    @IsOptional()
    @IsMobilePhone()
    phone: string;

}

export class SignupDTO {
    @IsOptional() // This field is optional
    @IsEmail()
    email: string;

    @IsOptional()
    @IsMobilePhone()
    phone: string;

    @IsString()
    @Length(6, 20)
    password: string;
}

export class VerifyOtpDTO {

    @IsString()
    accountName: string;

    @IsString()
    @Length(6, 6)
    otp: string;
}

export class LoginDto {

    @IsOptional()
    @IsEmail()
    email: string;

    @IsOptional()
    @IsPhoneNumber()
    phone: string;

    @IsString()
    @Length(6, 20)
    password: string;

    @IsOptional()
    @IsString()
    ip?: string;   

}
