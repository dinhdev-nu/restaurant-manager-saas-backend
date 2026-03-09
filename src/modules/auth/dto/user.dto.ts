import { IsBoolean, IsEmail, IsHash, IsMongoId, IsOptional, IsPhoneNumber, IsString, Length, ValidateIf } from "class-validator";
import { OTP_LENGTH } from "src/common/utils/otp.util";


export class CheckEmailDTO {
    @IsEmail()
    email: string;
}

export class RegisterDTO {
    @IsEmail()
    email: string;
    
    @IsString()
    @Length(6, 32)
    password: string;

    @IsString()
    @Length(5, 100)
    full_name: string;

    @IsOptional()
    @IsPhoneNumber('VN')
    phone?: string;
}

export class VerifyOTPDTO {
    @IsEmail()
    email: string;

    @IsString()
    @Length(OTP_LENGTH, OTP_LENGTH)
    otp: string;
}

export class ResendOTPDTO extends CheckEmailDTO {}

export class LoginDTO {

    @IsString()
    identifier: string; // email or phone

    @IsString()
    @Length(6, 32)
    password: string;

    @IsBoolean()
    remember_me: boolean;

    @IsOptional()
    device_info?: Record<string, any>;
}