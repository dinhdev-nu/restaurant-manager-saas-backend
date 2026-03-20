import { ApiHideProperty, ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Expose, Transform, Type } from "class-transformer";
import { IsBoolean, isEmail, IsEmail, IsMongoId, IsObject, IsOptional, IsPhoneNumber, IsString, Length } from "class-validator";
import { Types } from "mongoose";
import { IsEmailOrPhone } from "src/common/pipes/identifier.pipe";
import { OTP_LENGTH } from "src/common/utils/otp.util";


export class CheckEmailDTO {
    @ApiProperty({ example: 'alice@example.com', description: 'Email address to check' })
    @IsEmail()
    email: string;
}

export class RegisterDTO {
    @ApiProperty({ example: 'alice@example.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'Secret@123', minLength: 6, maxLength: 32 })
    @IsString()
    @Length(6, 32)
    password: string;

    @ApiProperty({ example: 'Nguyen Thi Alice', minLength: 5, maxLength: 100 })
    @IsString()
    @Length(5, 100)
    full_name: string;

    @ApiPropertyOptional({ example: '+84901234567', description: 'Vietnamese phone number (+84...)' })
    @IsOptional()
    @IsPhoneNumber('VN')
    phone?: string;
}

export class VerifyOTPDTO {
    @ApiProperty({ example: 'alice@example.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: '482931', description: `${OTP_LENGTH}-digit OTP code sent to email` })
    @IsString()
    @Length(OTP_LENGTH, OTP_LENGTH)
    otp: string;
}

export class ResendOTPDTO extends CheckEmailDTO {}
export class ForgotPasswordDTO extends CheckEmailDTO {}

export class VerifyForgotPasswordOTPDTO {
    @ApiProperty({ example: 'eyJzZXNzaW9uIjoidHJ1ZSJ9...', description: 'Session token received from the forgot-password step' })
    @IsString()
    session_token: string;

    @ApiProperty({ example: '192837', description: `${OTP_LENGTH}-digit OTP code sent to email` })
    @IsString()
    @Length(OTP_LENGTH, OTP_LENGTH)
    otp: string;
}

export class ResetPasswordDTO {
    @ApiProperty({ example: 'eyJncmFudCI6InRydWUifQ...', description: 'Grant token received from the reset-password/verify-otp step' })
    @IsString()
    grant_token: string;

    @ApiProperty({ example: 'NewPass@456', minLength: 6, maxLength: 32 })
    @IsString()
    @Length(6, 32)
    new_password: string;
}

export class ChangePasswordDTO {
    @ApiProperty({ example: 'Secret@123', minLength: 6, maxLength: 32 })
    @IsString()
    @Length(6, 32)
    current_password: string;

    @ApiProperty({ example: 'NewPass@456', minLength: 6, maxLength: 32 })
    @IsString()
    @Length(6, 32)
    new_password: string;
}

export class LoginDTO {
    @ApiProperty({ example: 'alice@example.com', description: 'Email address or Vietnamese phone number (+84...)' })
    @IsEmailOrPhone({ message: 'Invalid identifier format' })
    identifier: string; // email or phone

    @ApiHideProperty()
    @IsOptional()
    identifier_type?: 'email' | 'phone';

    @ApiProperty({ example: 'Secret@123', minLength: 6, maxLength: 32 })
    @IsString()
    @Length(6, 32)
    password: string;

    @ApiProperty({ example: false, description: 'true → refresh token cookie expires in 30 days, false → 7 days' })
    @IsBoolean()
    remember_me: boolean;

    @ApiHideProperty()
    @IsOptional()
    @IsObject()
    device_info?: DeviceInfo | null;

    @ApiHideProperty()
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
    @ApiProperty({ example: 'eyJ0bXAiOiJ0cnVlIn0...', description: 'Temporary token returned from the login step when 2FA is enabled' })
    @IsString()
    temp_token: string;
}

export class Verify2FAOTPDTO extends Send2FAOtpDTO {
    @ApiProperty({ example: '739104', description: `${OTP_LENGTH}-digit OTP code sent to email` })
    @IsString()
    @Length(OTP_LENGTH, OTP_LENGTH)
    otp: string;
}

export class Enable2FADTO {
    @ApiProperty({ example: 'Secret@123', minLength: 6, maxLength: 32, description: 'Current password to confirm identity' })
    @IsString()
    @Length(6, 32)
    password: string;
}

export class Disable2FADTO extends Enable2FADTO {}

export class RevokeSessionDTO {
    @ApiProperty({ example: '664f1a2b3c4d5e6f7a8b9c0e', description: 'MongoDB ObjectId of the session to revoke' })
    @IsMongoId()
    session_id: Types.ObjectId;
}

export class SendPhoneOTPDTO {
    @ApiProperty({ example: '+84901234567', description: 'Vietnamese phone number to bind to the account' })
    @IsPhoneNumber('VN')
    phone: string;
}

export class VerifyPhoneOTPDTO extends Verify2FAOTPDTO {}
