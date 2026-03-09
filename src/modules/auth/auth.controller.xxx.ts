import { Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service.xxx";
import { Public } from "src/common/decorators";
import { ThrottleCustom } from "src/common/decorators/throttler/throttler.decorator";
import { RegisterDTO, CheckEmailDTO, VerifyOTPDTO } from "./dto/user.dto";
import { SuccessResponse } from "src/common/interceptors/transform-response.interceptor";

@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService
    ) {}

    @Public()
    @ThrottleCustom('check-email', { ttl: 60000, limit: 20 })
    @Post("/check-email")
    async checkEmailExist(dto: CheckEmailDTO): Promise<{ available: boolean, hashed_id?: string }> {
        return this.authService.checkEmailExist(dto)
    }

    @Public()
    @ThrottleCustom('register', { ttl: 3600000, limit: 5 }) // 5req/hours
    @Post("/register")
    async register(dto: RegisterDTO) {
        const res =  this.authService.register(dto)
        return {
            data: res,
            message: "Registration successful, OTP sent to your email"
        } as SuccessResponse
    }

    @Public()
    @Post("/verify-otp")
    verifyOTP(dto: VerifyOTPDTO) {
        return this.authService.verifyOTP(dto)
    }

 
}