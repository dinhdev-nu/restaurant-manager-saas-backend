import { Expose, Transform, Type } from "class-transformer";
import { IsBoolean, isEmail, IsEmail, IsMongoId, IsObject, IsOptional, IsPhoneNumber, IsString, Length } from "class-validator";
import { Types } from "mongoose";
import { IsEmailOrPhone } from "src/common/pipes/identifier.pipe";
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
export class ForgotPasswordDTO extends CheckEmailDTO {}
export class VerifyForgotPasswordOTPDTO {
    @IsString()
    session_token: string;

    @IsString()
    @Length(OTP_LENGTH, OTP_LENGTH)
    otp: string;
}

export class ResetPasswordDTO {
    @IsString()
    grant_token: string;

    @IsString()
    @Length(6, 32)
    new_password: string;
}

export class ChangePasswordDTO {
    @IsString()
    @Length(6, 32)
    current_password: string;

    @IsString()
    @Length(6, 32)
    new_password: string;
}

export class LoginDTO {

    @IsEmailOrPhone({ message: 'Invalid identifier format' })
    identifier: string; // email or phone

    @IsOptional()
    identifier_type?: 'email' | 'phone';

    @IsString()
    @Length(6, 32)
    password: string;

    @IsBoolean()
    remember_me: boolean;

    @IsOptional()
    @IsObject()
    device_info?: DeviceInfo | null;
    
    @IsOptional()
    user_ip?: string;

}

export interface DeviceInfo {
    browser: string | null;
    os: string | null;
    device: string | null;
    user_agent: string | null;
}

export class Send2FAOtpDTO {
    @IsString()
    temp_token: string;
}
export class Verify2FAOTPDTO extends Send2FAOtpDTO {
    @IsString()
    @Length(OTP_LENGTH, OTP_LENGTH)
    otp: string;
}

export class Enable2FADTO {
    @IsString()
    @Length(6, 32)
    password: string;
}

export class Disable2FADTO extends Enable2FADTO {}

export class RevokeSessionDTO {
    @IsMongoId()
    session_id: Types.ObjectId;
}

export class SendPhoneOTPDTO {
    @IsPhoneNumber('VN')
    phone: string;
}

export class VerifyPhoneOTPDTO extends Verify2FAOTPDTO {}