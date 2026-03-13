import { Inject, Injectable } from "@nestjs/common";
import { Types } from "mongoose";
import { INJECTION_TOKEN } from "src/common/constants/injection-token.constant";
import { IUserRepository } from "./repositories/user.repository";
import { BadRequestException, NotFoundException, TooManyRequestException } from "src/common/exceptions";
import { ERROR_CODE } from "src/common/constants/error-code.constant";
import { UpdateUserPreferencesDTO, UpdateUserProfileDTO } from "./dto/user.dto";
import Redis from "ioredis";


const RATE_LIMIT_PROFILE_UPDATE = "ratelimit:profile:update:"

@Injectable()
export class UserService {

    constructor(
        @Inject(INJECTION_TOKEN.USER_REPOSITORY)
        private readonly userRepository: IUserRepository,

        @Inject(INJECTION_TOKEN.REDIS_CLIENT)
        private readonly redis: Redis
    ) {}

    async getUserProfile(userId: Types.ObjectId) {
        const user = await this.userRepository.getUserProfileById(userId);
        if (!user || user.status === 'banned') {
            throw new NotFoundException(
                ERROR_CODE.USER_NOT_FOUND,
                'Người dùng không tồn tại hoặc đã bị cấm'
            );
        }

        return user;
    }

    async updateUserProfile(userId: Types.ObjectId, dto: UpdateUserProfileDTO) {

        // Rate limit
        const rateLimitKey = `${RATE_LIMIT_PROFILE_UPDATE}${userId.toString()}`;
        const count = await this.redis.incr(rateLimitKey);
        if (count === 1) await this.redis.expire(rateLimitKey, 300); // Reset sau 60s
        if (count > 10){
            throw new TooManyRequestException(
                ERROR_CODE.TOO_MANY_REQUESTS,
                'Bạn đã thực hiện quá nhiều yêu cầu cập nhật hồ sơ. Vui lòng thử lại sau.'
            )
        }

        const nextDateOfBirth = dto.date_of_birth ? new Date(dto.date_of_birth) : undefined;
        if (nextDateOfBirth && nextDateOfBirth > new Date()) {
            throw new BadRequestException(
                ERROR_CODE.INVALID_INPUT_ERROR,
                'Ngày sinh không được phép trong tương lai'
            );
        }

        const updatedUser = await this.userRepository.updateUserProfile(userId, {
            ...dto,
            date_of_birth: nextDateOfBirth,
        } as UpdateUserProfileDTO & { date_of_birth?: Date });

        if (!updatedUser) {
            throw new NotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Người dùng không tồn tại');
        }

        return {
            updated: true,
            user: updatedUser
        };
    }

    async updateUserPreferences(userId: Types.ObjectId, dto: UpdateUserPreferencesDTO) {
        const hasPayload = dto.language !== undefined
            || dto.theme !== undefined
            || dto.notifications?.email !== undefined
            || dto.notifications?.phone !== undefined
            || dto.notifications?.push !== undefined;

        if (!hasPayload) {
            throw new BadRequestException(
                ERROR_CODE.INVALID_INPUT_ERROR,
                'Phải có ít nhất một trường preferences để cập nhật'
            );
        }

        const user = await this.userRepository.updateUserPreferences(userId, dto as unknown as Partial<Record<string, unknown>>);
        if (!user) {
            throw new NotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Người dùng không tồn tại');
        }

        return {
            updated: true,
            preferences: user.preferences
        };
    }
}