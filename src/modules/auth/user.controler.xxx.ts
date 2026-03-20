import { Body, Controller, Get, Patch } from "@nestjs/common";
import {
    ApiTags, ApiOperation, ApiBearerAuth,
    ApiOkResponse,
} from "@nestjs/swagger";
import { Types } from "mongoose";
import { CurrentUser } from "src/common/decorators";
import { UserService } from "./user.service.xxx";
import { UpdateUserPreferencesDTO, UpdateUserProfileDTO } from "./dto/user.dto";
import { swWrap } from "src/common/swagger/api-response.util";

const USER_SCHEMA = {
    _id:                { type: 'string',  example: '664f1a2b3c4d5e6f7a8b9c0d' },
    email:              { type: 'string',  example: 'alice@example.com' },
    phone:              { type: 'string',  nullable: true, example: '+84901234567' },
    full_name:          { type: 'string',  example: 'Nguyen Thi Alice' },
    avatar_url:         { type: 'string',  nullable: true, example: null },
    date_of_birth:      { type: 'string',  nullable: true, example: '1995-06-15' },
    gender:             { type: 'string',  nullable: true, enum: ['male', 'female', 'other'], example: 'female' },
    system_role:        { type: 'string',  enum: ['admin', 'user'], example: 'user' },
    status:             { type: 'string',  enum: ['active', 'inactive', 'banned', 'pending'], example: 'active' },
    email_verified_at:  { type: 'string',  nullable: true, format: 'date-time', example: '2026-03-10T08:35:00.000Z' },
    phone_verified_at:  { type: 'string',  nullable: true, format: 'date-time', example: '2026-03-10T09:00:00.000Z' },
    last_login_at:      { type: 'string',  nullable: true, format: 'date-time', example: '2026-03-13T08:00:00.000Z' },
    last_login_ip:      { type: 'string',  nullable: true, example: '14.240.102.55' },
    two_factor_enabled: { type: 'boolean', example: false },
    is_email_verified:  { type: 'boolean', example: true,  description: 'Virtual field' },
    is_phone_verified:  { type: 'boolean', example: true,  description: 'Virtual field' },
    preferences: {
        type: 'object',
        properties: {
            language: { type: 'string', enum: ['vi', 'en'], example: 'vi' },
            theme:    { type: 'string', enum: ['light', 'dark', 'system'], example: 'light' },
            notifications: {
                type: 'object',
                properties: {
                    email: { type: 'boolean', example: true },
                    sms:   { type: 'boolean', example: true },
                    push:  { type: 'boolean', example: true },
                },
            },
        },
    },
    created_at: { type: 'string', format: 'date-time', example: '2026-03-10T08:30:00.000Z' },
    updated_at: { type: 'string', format: 'date-time', example: '2026-03-13T08:00:00.000Z' },
};

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UserController {

    constructor(
        private readonly userService: UserService
    ) {}

    @ApiOperation({ summary: 'Get the currently authenticated user profile' })
    @ApiOkResponse({
        description: 'Full user profile',
        schema: swWrap({ type: 'object', properties: USER_SCHEMA }),
    })
    @Get("/me")
    async getProfile(
        @CurrentUser('sub') userId: Types.ObjectId
    ) {
        return this.userService.getUserProfile(userId)
    }

    @ApiOperation({
        summary: 'Update profile information',
        description: 'All fields are optional — only send the fields you want to change.',
    })
    @ApiOkResponse({
        description: 'Updated user profile',
        schema: swWrap({ type: 'object', properties: USER_SCHEMA }),
    })
    @Patch("/me")
    async updateProfile(
        @CurrentUser('sub') userId: Types.ObjectId,
        @Body() dto: UpdateUserProfileDTO
    ) {
        return this.userService.updateUserProfile(userId, dto)
    }

    @ApiOperation({
        summary: 'Update user preferences',
        description: 'All fields are optional — only send the fields you want to change.',
    })
    @ApiOkResponse({
        description: 'Updated preferences',
        schema: swWrap({
            type: 'object',
            properties: {
                language: { type: 'string', enum: ['vi', 'en'], example: 'vi' },
                theme:    { type: 'string', enum: ['light', 'dark', 'system'], example: 'dark' },
                notifications: {
                    type: 'object',
                    properties: {
                        email: { type: 'boolean', example: true },
                        sms:   { type: 'boolean', example: true },
                        push:  { type: 'boolean', example: false },
                    },
                },
            },
        }),
    })
    @Patch("/me/preferences")
    async updatePreferences(
        @CurrentUser('sub') userId: Types.ObjectId,
        @Body() dto: UpdateUserPreferencesDTO
    ) {
        return this.userService.updateUserPreferences(userId, dto)
    }
}
