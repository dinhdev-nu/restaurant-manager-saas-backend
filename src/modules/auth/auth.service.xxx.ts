import { Inject, Injectable } from "@nestjs/common";
import { INJECTION_TOKEN } from "src/common/constants/injection-token.constant";
import { IUserRepository } from "./repositories/user.repository";
import { CheckEmailDTO, LoginDTO, RegisterDTO, ResendOTPDTO, VerifyOTPDTO } from "./dto/user.dto";
import { BadRequestException, ConflictException, NotFoundException, TooManyRequestException, UnauthorizedException } from "src/common/exceptions";
import { ERROR_CODE } from "src/common/constants/error-code.constant";
import { HashUtil } from "src/common/utils/hash.util";
import { OtpUtils } from "src/common/utils/otp.util";
import { Types } from "mongoose";
import Redis from "ioredis";
import { OTPProducer } from "src/queue/producers/otp.producer";

const OTP_EMAIL_PREFIX = "otp:email_verify:"
const OTP_EXPIRATION_TIME = 5 * 60; // 5 minutes
type OTPValue = {
    otpHash: string;
    attempt: number;
}

@Injectable()
export class AuthService {
    constructor(
        @Inject(INJECTION_TOKEN.USER_REPOSITORY) 
        private readonly userRepository: IUserRepository,

        @Inject(INJECTION_TOKEN.REDIS_CLIENT)
        private readonly redis: Redis,

        private readonly otpProducer: OTPProducer
    ) {}

    async checkEmailExist(dto: CheckEmailDTO): Promise<{ available: boolean, acction?: string }> {
        const user = await this.userRepository.findUserExistByEmail(dto.email);
        
        if (user === null) { 
            return { available: true }
        }
        
        if (user.status === 'pending') {
            return { available: false , acction: 'resend_otp'}
        } else if (['active', 'inactive', 'banned'].includes(user.status)) {
            throw new ConflictException(
                ERROR_CODE.USER_EXISTS,
                `User with ${dto.email} already exists`
            )
        }

        return { available: true }
    }

    async register(dto: RegisterDTO): Promise<{ message: string, acction?: string }> {
        // Check user exist again
        const userExist = await this.checkEmailExist({ email: dto.email });
        if (!userExist.available) {
            return { message: "User pending", acction: "resend_otp" };
        }

        // Check phone exist
        if (dto.phone) {
            const phoneExist = await this.userRepository.findUserExistByPhone(dto.phone);
            if (phoneExist) {
                throw new ConflictException(
                    ERROR_CODE.USER_EXISTS,
                    `User with phone ${dto.phone} already exists`
                )
            }
        }

        // Hash password
        const hashedPassword = await HashUtil.hash(dto.password);
        

        // Create User 
        const user = await this.userRepository.create({
            email: dto.email,
            password_hash: hashedPassword,
            full_name: dto.full_name,
            phone: dto.phone,
            system_role: 'user',
            status: 'pending',
            email_verified_at: null
        })

        // Create OTP
        const otp = OtpUtils.generateOTP()

        
        const hashedOTP = await HashUtil.hashWithSHA256(otp);
        const value = JSON.stringify({
            otpHash: hashedOTP,
            attempt: 0
        } as OTPValue)
        const KEY = `${OTP_EMAIL_PREFIX}${user._id}`;
        this.redis.set(KEY, value, 'EX', OTP_EXPIRATION_TIME);

        // Send OTP queue
        await this.otpProducer.sendMailOTP({
            email: dto.email,
            userId: user._id,
            otp,
            ttl: OTP_EXPIRATION_TIME
        });

        return { message: "OTP sent" }
    }

    async verifyOTP(dto: VerifyOTPDTO): Promise<{ verified: boolean }> {

        // Get user pending document
        const user = await this.userRepository.getUserPendingDocumentByEmail(dto.email);
        if (!user) {
            throw new NotFoundException(
                ERROR_CODE.USER_NOT_FOUND,
                `User with email ${dto.email} not found`
            )
        }

        // Get OTP
        const KEY = `${OTP_EMAIL_PREFIX}${user._id}`;
        const otp = await this.redis.get(KEY);

        if (!otp)
            throw new NotFoundException(
                ERROR_CODE.OTP_NOT_FOUND,
                "OTP not found or expired"
            )
            
        // Check attempt
        const otpValue = JSON.parse(otp) as OTPValue;
        if (otpValue.attempt >= 5) {
            await this.redis.del(KEY);
            throw new TooManyRequestException(
                ERROR_CODE.OTP_SEND_LIMIT_EXCEEDED,
                "Too many attempts, please request a new OTP"
            )
        }
        // Verify OTP
        const isValidOTP = await HashUtil.compare(dto.otp, otpValue.otpHash);
        if (!isValidOTP) {
            otpValue.attempt += 1;
            await this.redis.set(KEY, JSON.stringify(otpValue), 'KEEPTTL');
            throw new UnauthorizedException(
                ERROR_CODE.OTP_INVALID,
                "Sai OTP. Còn " + (5 - otpValue.attempt) + " lần thử."
            )
        }

        
        // Update user
        user.email_verified_at = new Date();
        user.status = 'active';
        await user.save();
        
        // Del OTP
        await this.redis.del(KEY);   
        
        return { verified: true }
    }

    async resendOTP(dto: ResendOTPDTO): Promise<{ message: string }> {

        // Check user exist and pending status
        const userExist = await this.userRepository.findUserPendingByEmail(dto.email);
        if (!userExist) {
            throw new NotFoundException(
                ERROR_CODE.USER_NOT_FOUND,
                `User with email ${dto.email} not found or not pending`
            )
        }
        
        // Del old OTP
        const KEY = `${OTP_EMAIL_PREFIX}${userExist._id}`;
        await this.redis.del(KEY);
        
        // Create new OTP
        const otp = OtpUtils.generateOTP()
        const hashedOtp = await HashUtil.hashWithSHA256(otp);
        const value = JSON.stringify({
            user_id: userExist._id.toString(),
            otpHash: hashedOtp,
            attempt: 0
        } as OTPValue)
        await this.redis.set(KEY, value, 'EX', OTP_EXPIRATION_TIME);

        await this.otpProducer.sendMailOTP({
            email: dto.email,
            userId: userExist._id,
            otp,
            ttl: OTP_EXPIRATION_TIME
        });

        return { message: "Sent"}
    }

    async login(dto: LoginDTO): Promise<{ token: string }> {

        
    }
}