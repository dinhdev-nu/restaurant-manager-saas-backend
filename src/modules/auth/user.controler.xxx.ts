import { Body, Controller, Get, Patch } from "@nestjs/common";
import { Types } from "mongoose";
import { CurrentUser } from "src/common/decorators";
import { UserService } from "./user.service.xxx";
import { UpdateUserPreferencesDTO, UpdateUserProfileDTO } from "./dto/user.dto";


@Controller('users')
export class UserController {

    constructor(
        private readonly userService: UserService
    ) {}

    @Get("/me")
    async getProfile(
        @CurrentUser('sub') userId: Types.ObjectId
    ) {
        return this.userService.getUserProfile(userId)
    }

    @Patch("/me")
    async updateProfile(
        @CurrentUser('sub') userId: Types.ObjectId,
        @Body() dto: UpdateUserProfileDTO
    ) {
        return this.userService.updateUserProfile(userId, dto)
    }

    @Patch("/me/preferences")
    async updatePreferences(
        @CurrentUser('sub') userId: Types.ObjectId,
        @Body() dto: UpdateUserPreferencesDTO
    ) {
        return this.userService.updateUserPreferences(userId, dto)
    }

}