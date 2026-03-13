import { Body, Controller, Delete, Get, Param, Post, Req, Res } from "@nestjs/common";
import { AuthService } from "./auth.service.xxx";
import { Cookie, CurrentUser, Public } from "src/common/decorators";
import { ThrottleCustom } from "src/common/decorators/throttler/throttler.decorator";
import { RegisterDTO, CheckEmailDTO, VerifyOTPDTO, ResendOTPDTO, LoginDTO, DeviceInfo, 
    Send2FAOtpDTO, Verify2FAOTPDTO, ForgotPasswordDTO, VerifyForgotPasswordOTPDTO, 
    ResetPasswordDTO, ChangePasswordDTO, Enable2FADTO, Disable2FADTO, RevokeSessionDTO, 
    SendPhoneOTPDTO, VerifyPhoneOTPDTO } from "./dto/auth.dto";
import { SuccessResponse } from "src/common/interceptors/transform-response.interceptor";
import { UserIP } from "src/common/decorators/user/ip.decorator";
import { UserDevice } from "src/common/decorators/user/device.decotator";
import { Request, Response } from "express";
import { Types } from "mongoose";
import { AppConfigService } from "src/config/config.service";

@Controller('auths')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly config: AppConfigService
    ) {}

    @Public()
    @ThrottleCustom('check-email', { ttl: 60000, limit: 20 })
    @Post("/check-email")
    async checkEmailExist(@Body() dto: CheckEmailDTO): Promise<{ available: boolean, hashed_id?: string }> {
        return this.authService.checkEmailExist(dto)
    }

    @Public()
    @ThrottleCustom('register', { ttl: 3600000, limit: 5 }) // 5req/hours
    @Post("/register")
    async register(@Body() dto: RegisterDTO) {
        const res =  await this.authService.register(dto)
        return {
            data: res,
            message: "Registration successful, OTP sent to your email"
        } as SuccessResponse
    }

    @Public()
    @Post("/verify-otp")
    async verifyOTP(@Body() dto: VerifyOTPDTO) {
        return this.authService.verifyOTP(dto)
    }

    @Public()
    @Post("/resend-otp")
    async resendOTP(@Body() dto: ResendOTPDTO) {
        return this.authService.resendOTP(dto)
    }

    @Public()
    @ThrottleCustom('login', { ttl: 300000, limit: 10 }) // 10req/5 phút
    @Post("/login")
    async login(
        @UserIP() user_ip: string, @UserDevice() user_device: DeviceInfo, @Body() dto: LoginDTO,
        @Res({ passthrough: true }) res: Response
    ) {
        dto.identifier_type = dto.identifier.includes('@') ? 'email' : 'phone';
        dto.user_ip = user_ip;
        dto.device_info = user_device;
        const response = await this.authService.login(dto)
        if ('refresh_token' in response && response.refresh_token) {
            res.cookie('refresh_token', response.refresh_token, {
                httpOnly: true,
                secure: true,
                sameSite: 'strict',
                maxAge: dto.remember_me ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000,
            });
            return {
                access_token: response.access_token
            }
         }  
        return response;
    }

    @Public()
    @Post("2fa/send-otp")
    async send2FAOTP(@UserIP() user_ip: string, @Body() dto: Send2FAOtpDTO) {
        return this.authService.send2FAEmailOTP(dto.temp_token, user_ip)
    }

    @Public()
    @Post("2fa/verify-otp")
    async verify2FAOTP(
        @UserIP() user_ip: string, @Body() dto: Verify2FAOTPDTO, 
        @Res({ passthrough: true }) res: Response
    ) {
        const response = await this.authService.verify2FAOTP(dto.temp_token, dto.otp, user_ip)
        res.cookie('refresh_token', response.refresh_token, {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            maxAge: this.getTimeToLifeCookies(response.remember_me),
            }
        );

        return { access_token: response.access_token }
    }

    @Public()
    @Post("/refresh-token") 
    async refreshToken(
        @Cookie('REFRESH_TOKEN') refresh_token: string, 
        @Res({ passthrough: true }) res: Response
    ) {
        const response = await this.authService.refreshToken(refresh_token)
        if (response.refresh_token ) {
            res.cookie('refresh_token', response.refresh_token, {
                httpOnly: true,
                secure: true,
                sameSite: 'strict',
                maxAge: this.getTimeToLifeCookies(response.remember_me ?? false),
            });
        }
        return { access_token: response.access_token };
    }

    @Post("/logout")
    async logout(
        @Cookie('REFRESH_TOKEN') refresh_token: string,
        @CurrentUser('jti') jti: string,
        @Res({ passthrough: true }) res: Response
    ) {

        res.clearCookie('refresh_token', {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
        });

        return this.authService.logout(refresh_token, jti)
    }

    @Post("/logout-all")
    async logoutAllSessions(
        @CurrentUser('sub') user_id: Types.ObjectId,
        @CurrentUser('jti') jti: string,
        @Cookie('REFRESH_TOKEN') refresh_token: string,
        @Res({ passthrough: true }) res: Response
    ){
        res.clearCookie('refresh_token', {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
        });
        return this.authService.logoutAllSessions(user_id, refresh_token, jti)
    }

    @Public()
    @ThrottleCustom('forgot-password', { ttl: 3600000, limit: 5 }) // 5req/hours
    @Post("/forgot-password") 
    async forgotPassword(@Body() dto: ForgotPasswordDTO) {
        return this.authService.forgotPassword(dto.email)
    }

    @Public()
    @Post("/reset-password/verify-otp")
    async verifyForgotPasswordOTP(@Body() dto: VerifyForgotPasswordOTPDTO) {
        return this.authService.verifyForgotPasswordOTP(dto.session_token, dto.otp)
    }

    @Public()
    @Post("/reset-password")
    async resetPassword(@Body() dto: ResetPasswordDTO) {
        return this.authService.resetPassword(dto.grant_token, dto.new_password)
    }

    @Post("/change-password")
    async changePassword(
        @CurrentUser('sub') user_id: Types.ObjectId,
        @Cookie('REFRESH_TOKEN') refresh_token: string,
        @Body() dto: ChangePasswordDTO
    ) {
        return this.authService.changePassword(user_id, refresh_token, dto.current_password, dto.new_password)
    }

    @Post("/2fa/enable")
    async enable2FA(
        @CurrentUser('sub') user_id: Types.ObjectId,
        @Body() dto: Enable2FADTO
    ) {
        return this.authService.enable2FA(user_id, dto.password)
    }

    @Post("/2fa/disable")
    async disable2FA(
        @CurrentUser('sub') user_id: Types.ObjectId,
        @Body() dto: Disable2FADTO
    ) {
        return this.authService.disable2FA(user_id, dto.password)
    }  
    
    @Get("/sessions")
    async getSessions(
        @CurrentUser('sub') user_id: Types.ObjectId,
        @Cookie('REFRESH_TOKEN') refresh_token: string
    ) {
        return this.authService.getSessions(user_id, refresh_token)
    }

    @Delete("/sessions")
    async revokeSession(
        @CurrentUser('sub') user_id: Types.ObjectId,
        @Body() dto: RevokeSessionDTO,
        @Cookie('REFRESH_TOKEN') refresh_token: string,
        @CurrentUser('jti') jti: string,
        @Res({ passthrough: true }) res: Response
    ){
        res.clearCookie('refresh_token', {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
        });
        return this.authService.revokeSession(user_id, dto.session_id, refresh_token, jti)
    }

    @Post('/phone/send-otp')
    async sendPhoneOTP(
        @CurrentUser('sub') user_id: Types.ObjectId,
        @Body() dto: SendPhoneOTPDTO
    ) {
        return this.authService.sendPhoneOTP(user_id, dto.phone)
    }

    @Post('/phone/verify-otp')
    async verifyPhoneOTP(
        @CurrentUser('sub') user_id: Types.ObjectId,
        @Body() dto: VerifyPhoneOTPDTO
    ) {
        return this.authService.verifyPhoneOTP(user_id, dto.otp)
    }

    @Public()
    @Get('/oauth/:provider')
    async oauthLogin(@Param('provider') provider: string, @Res() res: Response) {
        const { redirect_url } = await this.authService.oauthInit(provider)
        return res.redirect(redirect_url);
    }

    @Public()
    @Get('/:provider/callback') 
    async oauthCallback( 
        @Param('provider') provider: string,
        @UserIP() user_ip: string,
        @UserDevice() user_device: DeviceInfo,
        @Req() req: Request,
        @Res() res: Response
    ) {
        const { code, state } = req.query as { code: string, state: string }
        const dto: LoginDTO = {
            identifier: '',
            identifier_type: 'email',
            password: '',
            remember_me: false,
            user_ip,
            device_info: user_device
        }

        const response = await this.authService.oauthCallback(provider, code, state, dto)
        res.cookie('refresh_token', response.refresh_token, {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            maxAge: this.getTimeToLifeCookies(false),
        });
        const url = this.config.client.clientUrl + "oauth/callback?access_token=" + response.access_token
        return res.redirect(url);
    }

    private getTimeToLifeCookies(rememberMe: boolean): number {
        return rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    }
}