import { IsEmail, IsMobilePhone, IsOptional, IsPhoneNumber, IsString, Length } from "class-validator";

export class RegisterDTO {
    @IsOptional() // This field is optional
    @IsEmail()
    email: string;

    @IsOptional()
    @IsMobilePhone()
    phone: string;

    @IsString()
    @Length(6, 20)
    password: string;
    // @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{6,20}$/, {
    //     message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    // })

}

export class VerifyOtpDTO {

    @IsString()
    accountName: string;

    @IsString()
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
