import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, Length, ValidateNested } from "class-validator";

export class UpdateUserNotificationPreferencesDTO {
    @ApiPropertyOptional({ example: true, description: 'Receive email notifications' })
    @IsOptional()
    @IsBoolean()
    email?: boolean;

    @ApiPropertyOptional({ example: true, description: 'Receive SMS notifications' })
    @IsOptional()
    @IsBoolean()
    phone?: boolean;

    @ApiPropertyOptional({ example: false, description: 'Receive push notifications' })
    @IsOptional()
    @IsBoolean()
    push?: boolean;
}

export class UpdateUserProfileDTO {
    @ApiPropertyOptional({ example: 'Nguyen Thi Alice', minLength: 6, maxLength: 32 })
    @IsOptional()
    @IsString()
    @Length(6, 32)
    full_name?: string;

    @ApiPropertyOptional({ example: '1995-06-15', description: 'ISO 8601 date format (YYYY-MM-DD)' })
    @IsOptional()
    @IsISO8601()
    date_of_birth?: string;

    @ApiPropertyOptional({ enum: ['male', 'female', 'other'], example: 'female' })
    @IsOptional()
    @IsEnum(['male', 'female', 'other'])
    gender?: 'male' | 'female' | 'other';
}

export class UpdateUserPreferencesDTO {
    @ApiPropertyOptional({ enum: ['en', 'vi'], example: 'vi', description: 'UI language' })
    @IsOptional()
    @IsEnum(['en', 'vi'])
    language?: 'en' | 'vi';

    @ApiPropertyOptional({ enum: ['light', 'dark', 'system'], example: 'dark', description: 'UI theme' })
    @IsOptional()
    @IsEnum(['light', 'dark', 'system'])
    theme?: 'light' | 'dark' | 'system';

    @ApiPropertyOptional({ type: () => UpdateUserNotificationPreferencesDTO, description: 'Notification channel preferences' })
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => UpdateUserNotificationPreferencesDTO)
    notifications?: UpdateUserNotificationPreferencesDTO;
}
