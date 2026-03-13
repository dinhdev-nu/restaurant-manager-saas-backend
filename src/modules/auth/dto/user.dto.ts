import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, Length, ValidateNested } from "class-validator";

export class UpdateUserNotificationPreferencesDTO {
    @IsOptional()
    @IsBoolean()
    email?: boolean;
    @IsOptional()
    @IsBoolean()
    phone?: boolean;
    @IsOptional()
    @IsBoolean()
    push?: boolean;
}

export class UpdateUserProfileDTO {
    @IsOptional()
    @IsString()
    @Length(6, 32)
    full_name?: string;

    // Không trong tương lai
    @IsOptional()
    @IsISO8601()
    date_of_birth?: string;

    @IsOptional()
    @IsEnum(['male', 'female', 'other'])
    gender?: 'male' | 'female' | 'other';
}

export class UpdateUserPreferencesDTO { 
    @IsOptional()
    @IsEnum(['en', 'vi'])
    language?: 'en' | 'vi';

    @IsOptional()
    @IsEnum(['light', 'dark', 'system'])
    theme?: 'light' | 'dark' | 'system';

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => UpdateUserNotificationPreferencesDTO)
    notifications?: UpdateUserNotificationPreferencesDTO; 
}
 
