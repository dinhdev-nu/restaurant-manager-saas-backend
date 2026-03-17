import { Body, Controller, Delete, Get, Param, Post, Req, Res } from "@nestjs/common";
import {
    ApiTags, ApiOperation, ApiBearerAuth, ApiCookieAuth,
    ApiOkResponse, ApiConflictResponse, ApiUnauthorizedResponse,
    ApiTooManyRequestsResponse, ApiBadRequestResponse, ApiParam,
    ApiResponse, ApiExcludeEndpoint,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service.xxx";
import { Cookie, CurrentUser, Public } from "src/common/decorators";
import { ThrottleCustom } from "src/common/decorators/throttler/throttler.decorator";
import {
    RegisterDTO, CheckEmailDTO, VerifyOTPDTO, ResendOTPDTO, LoginDTO, DeviceInfo,
    Send2FAOtpDTO, Verify2FAOTPDTO, ForgotPasswordDTO, VerifyForgotPasswordOTPDTO,
    ResetPasswordDTO, ChangePasswordDTO, Enable2FADTO, Disable2FADTO, RevokeSessionDTO,
    SendPhoneOTPDTO, VerifyPhoneOTPDTO,
} from "./dto/auth.dto";
import { SuccessResponse } from "src/common/interceptors/transform-response.interceptor";
import { UserIP } from "src/common/decorators/user/ip.decorator";
import { UserDevice } from "src/common/decorators/user/device.decotator";
import { Request, Response } from "express";
import { Types } from "mongoose";
import { AppConfigService } from "src/config/config.service";
import { swMsg, swWrap } from "src/common/swagger/api-response.util";

@ApiTags('auth')
@Controller('auths')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly config: AppConfigService
    ) {}

    // ─── Registration flow ────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Check if an email is already registered' })
    @ApiOkResponse({
        description: 'Email availability check result',
        schema: {
            properties: {
                available: { type: 'boolean', example: true },
                hashed_id: { type: 'string', example: 'a1b2c3d4e5f6...', nullable: true,
                    description: 'Present only when available = false (hint for client to redirect to login)' },
            },
        },
    })
    @ApiTooManyRequestsResponse({ description: 'Rate limit: 20 requests per 60 seconds' })
    @Public()
    @ThrottleCustom('check-email', { ttl: 60000, limit: 20 })
    @Post("/check-email")
    async checkEmailExist(@Body() dto: CheckEmailDTO): Promise<{ available: boolean, hashed_id?: string }> {
        return this.authService.checkEmailExist(dto)
    }

    @ApiOperation({
        summary: 'Register a new account',
        description: 'Creates account and sends OTP verification email. **Rate limit: 5 req / hour**.',
    })
    @ApiOkResponse({
        description: 'Account created — OTP sent to email',
        schema: swWrap({ user_id: { type: 'string', example: '664f1a2b3c4d5e6f7a8b9c0d' } },
            'Registration successful, OTP sent to your email'),
    })
    @ApiConflictResponse({ description: 'Email already registered' })
    @ApiTooManyRequestsResponse({ description: 'Rate limit: 5 requests per hour' })
    @Public()
    @ThrottleCustom('register', { ttl: 3600000, limit: 5 })
    @Post("/register")
    async register(@Body() dto: RegisterDTO) {
        const res = await this.authService.register(dto)
        return {
            data: res,
            message: "Registration successful, OTP sent to your email"
        } as SuccessResponse
    }

    @ApiOperation({ summary: 'Verify email OTP after registration' })
    @ApiOkResponse({ description: 'Email verified — account is now active', schema: swMsg('Email verified successfully') })
    @ApiBadRequestResponse({ description: 'Invalid or expired OTP' })
    @Public()
    @Post("/verify-otp")
    async verifyOTP(@Body() dto: VerifyOTPDTO) {
        return this.authService.verifyOTP(dto)
    }

    @ApiOperation({ summary: 'Resend email verification OTP' })
    @ApiOkResponse({ description: 'OTP resent', schema: swMsg('OTP resent') })
    @Public()
    @Post("/resend-otp")
    async resendOTP(@Body() dto: ResendOTPDTO) {
        return this.authService.resendOTP(dto)
    }

    // ─── Login flow ───────────────────────────────────────────────────────────

    @ApiOperation({
        summary: 'Login with email or phone number',
        description: [
            'Authenticates the user and returns an `access_token`.',
            'An `httpOnly` **refresh_token** cookie is set automatically on success.',
            'If the account has 2FA enabled, a `temp_token` is returned instead — use it to complete login via the 2FA endpoints.',
            '',
            '**Rate limit:** 10 requests per 5 minutes.',
        ].join('\n'),
    })
    @ApiOkResponse({
        description: 'Login successful (no 2FA) — refresh_token set as httpOnly cookie',
        schema: swWrap({ access_token: { type: 'string', example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...' } }),
    })
    @ApiResponse({
        status: 200,
        description: 'Login requires 2FA — use temp_token with the 2fa/send-otp and 2fa/verify-otp endpoints',
        schema: swWrap({
            requires_2fa: { type: 'boolean', example: true },
            temp_token:   { type: 'string',  example: 'eyJ0bXAiOiJ0cnVlIn0...' },
        }),
    })
    @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
    @ApiTooManyRequestsResponse({ description: 'Rate limit: 10 requests per 5 minutes' })
    @Public()
    @ThrottleCustom('login', { ttl: 300000, limit: 10 })
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
            return { access_token: response.access_token }
        }
        return response;
    }

    // ─── 2FA flow ─────────────────────────────────────────────────────────────

    @ApiOperation({
        summary: 'Send 2FA OTP to registered email',
        description: 'Use the `temp_token` received from the login step when the account has 2FA enabled.',
    })
    @ApiOkResponse({ description: '2FA OTP sent to email', schema: swMsg('2FA OTP sent to your email') })
    @ApiUnauthorizedResponse({ description: 'Invalid or expired temp_token' })
    @Public()
    @Post("2fa/send-otp")
    async send2FAOTP(@UserIP() user_ip: string, @Body() dto: Send2FAOtpDTO) {
        return this.authService.send2FAEmailOTP(dto.temp_token, user_ip)
    }

    @ApiOperation({
        summary: 'Verify 2FA OTP and complete login',
        description: 'On success, sets an `httpOnly` **refresh_token** cookie and returns an `access_token`.',
    })
    @ApiOkResponse({
        description: 'Login completed — refresh_token set as httpOnly cookie',
        schema: swWrap({ access_token: { type: 'string', example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...' } }),
    })
    @ApiUnauthorizedResponse({ description: 'Invalid or expired OTP / temp_token' })
    @Public()
    @Post("2fa/verify-otp")
    async verify2FAOTP(
        @UserIP() user_ip: string, @Body() dto: Verify2FAOTPDTO,
        @Res({ passthrough: true }) res: Response
    ) {
        const response = await this.authService.verify2FAOTP(dto.temp_token, dto.otp, user_ip)
        res.cookie('refresh_token', response.refresh_token, {
            httpOnly: true, secure: true, sameSite: 'strict',
            maxAge: this.getTimeToLifeCookies(response.remember_me),
        });
        return { access_token: response.access_token }
    }

    // ─── Token management ─────────────────────────────────────────────────────

    @ApiOperation({
        summary: 'Refresh access token',
        description: 'Exchanges the `refresh_token` httpOnly cookie for a new `access_token`. The cookie is rotated automatically.',
    })
    @ApiCookieAuth('refresh_token')
    @ApiOkResponse({
        description: 'New access token issued — refresh_token cookie rotated',
        schema: swWrap({ access_token: { type: 'string', example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...' } }),
    })
    @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired refresh_token cookie' })
    @Public()
    @Post("/refresh-token")
    async refreshToken(
        @Cookie('REFRESH_TOKEN') refresh_token: string,
        @Res({ passthrough: true }) res: Response
    ) {
        const response = await this.authService.refreshToken(refresh_token)
        if (response.refresh_token) {
            res.cookie('refresh_token', response.refresh_token, {
                httpOnly: true, secure: true, sameSite: 'strict',
                maxAge: this.getTimeToLifeCookies(response.remember_me ?? false),
            });
        }
        return { access_token: response.access_token };
    }

    @ApiOperation({ summary: 'Logout — invalidate current session' })
    @ApiBearerAuth()
    @ApiCookieAuth('refresh_token')
    @ApiOkResponse({ description: 'Session invalidated — refresh_token cookie cleared', schema: swMsg('Logged out successfully') })
    @Post("/logout")
    async logout(
        @Cookie('REFRESH_TOKEN') refresh_token: string,
        @CurrentUser('jti') jti: string,
        @Res({ passthrough: true }) res: Response
    ) {
        res.clearCookie('refresh_token', { httpOnly: true, secure: true, sameSite: 'strict' });
        return this.authService.logout(refresh_token, jti)
    }

    @ApiOperation({ summary: 'Logout all sessions across every device' })
    @ApiBearerAuth()
    @ApiCookieAuth('refresh_token')
    @ApiOkResponse({ description: 'All sessions revoked', schema: swMsg('All sessions revoked') })
    @Post("/logout-all")
    async logoutAllSessions(
        @CurrentUser('sub') user_id: Types.ObjectId,
        @CurrentUser('jti') jti: string,
        @Cookie('REFRESH_TOKEN') refresh_token: string,
        @Res({ passthrough: true }) res: Response
    ) {
        res.clearCookie('refresh_token', { httpOnly: true, secure: true, sameSite: 'strict' });
        return this.authService.logoutAllSessions(user_id, refresh_token, jti)
    }

    // ─── Password management ─────────────────────────────────────────────────

    @ApiOperation({
        summary: 'Request password reset — sends OTP to email',
        description: '**Rate limit:** 5 requests per hour.',
    })
    @ApiOkResponse({
        description: 'OTP sent — use session_token in the next step',
        schema: swWrap(
            {
                session_token: { type: 'string', example: 'eyJzZXNzaW9uIjoidHJ1ZSJ9...',
                    description: 'TTL: 10 minutes' },
            },
            'OTP sent to your email'
        ),
    })
    @ApiTooManyRequestsResponse({ description: 'Rate limit: 5 requests per hour' })
    @Public()
    @ThrottleCustom('forgot-password', { ttl: 3600000, limit: 5 })
    @Post("/forgot-password")
    async forgotPassword(@Body() dto: ForgotPasswordDTO) {
        return this.authService.forgotPassword(dto.email)
    }

    @ApiOperation({ summary: 'Verify reset-password OTP — exchange for a grant_token' })
    @ApiOkResponse({
        description: 'OTP verified — use grant_token in the reset-password step',
        schema: swWrap({
            grant_token: { type: 'string', example: 'eyJncmFudCI6InRydWUifQ...', description: 'TTL: 5 minutes' },
        }),
    })
    @ApiBadRequestResponse({ description: 'Invalid or expired OTP / session_token' })
    @Public()
    @Post("/reset-password/verify-otp")
    async verifyForgotPasswordOTP(@Body() dto: VerifyForgotPasswordOTPDTO) {
        return this.authService.verifyForgotPasswordOTP(dto.session_token, dto.otp)
    }

    @ApiOperation({ summary: 'Set a new password using the grant_token' })
    @ApiOkResponse({ description: 'Password reset successfully', schema: swMsg('Password reset successfully') })
    @ApiUnauthorizedResponse({ description: 'Invalid or expired grant_token' })
    @Public()
    @Post("/reset-password")
    async resetPassword(@Body() dto: ResetPasswordDTO) {
        return this.authService.resetPassword(dto.grant_token, dto.new_password)
    }

    @ApiOperation({ summary: 'Change password while authenticated' })
    @ApiBearerAuth()
    @ApiCookieAuth('refresh_token')
    @ApiOkResponse({ description: 'Password changed', schema: swMsg('Password changed successfully') })
    @ApiUnauthorizedResponse({ description: 'Current password is incorrect' })
    @Post("/change-password")
    async changePassword(
        @CurrentUser('sub') user_id: Types.ObjectId,
        @Cookie('REFRESH_TOKEN') refresh_token: string,
        @Body() dto: ChangePasswordDTO
    ) {
        return this.authService.changePassword(user_id, refresh_token, dto.current_password, dto.new_password)
    }

    // ─── 2FA management ───────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Enable two-factor authentication', description: 'Requires password confirmation.' })
    @ApiBearerAuth()
    @ApiOkResponse({ description: '2FA enabled', schema: swMsg('2FA enabled successfully') })
    @ApiUnauthorizedResponse({ description: 'Password is incorrect' })
    @Post("/2fa/enable")
    async enable2FA(
        @CurrentUser('sub') user_id: Types.ObjectId,
        @Body() dto: Enable2FADTO
    ) {
        return this.authService.enable2FA(user_id, dto.password)
    }

    @ApiOperation({ summary: 'Disable two-factor authentication', description: 'Requires password confirmation.' })
    @ApiBearerAuth()
    @ApiOkResponse({ description: '2FA disabled', schema: swMsg('2FA disabled successfully') })
    @ApiUnauthorizedResponse({ description: 'Password is incorrect' })
    @Post("/2fa/disable")
    async disable2FA(
        @CurrentUser('sub') user_id: Types.ObjectId,
        @Body() dto: Disable2FADTO
    ) {
        return this.authService.disable2FA(user_id, dto.password)
    }

    // ─── Session management ───────────────────────────────────────────────────

    @ApiOperation({ summary: 'List all active sessions for the current user' })
    @ApiBearerAuth()
    @ApiCookieAuth('refresh_token')
    @ApiOkResponse({
        description: 'Session list',
        schema: swWrap({
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    _id:          { type: 'string',  example: '664f1a2b3c4d5e6f7a8b9c0d' },
                    device_info: {
                        type: 'object',
                        properties: {
                            browser:    { type: 'string', nullable: true, example: 'Chrome 124' },
                            os:         { type: 'string', nullable: true, example: 'Windows 11' },
                            device:     { type: 'string', nullable: true, example: 'Desktop' },
                            user_agent: { type: 'string', nullable: true, example: 'Mozilla/5.0 ...' },
                        },
                    },
                    ip_address:   { type: 'string', nullable: true, example: '14.240.102.55' },
                    created_at:   { type: 'string', format: 'date-time', example: '2026-03-10T08:30:00.000Z' },
                    last_used_at: { type: 'string', format: 'date-time', example: '2026-03-13T14:22:10.000Z' },
                    is_current:   { type: 'boolean', example: true, description: 'true = session being used right now' },
                },
            },
        }),
    })
    @Get("/sessions")
    async getSessions(
        @CurrentUser('sub') user_id: Types.ObjectId,
        @Cookie('REFRESH_TOKEN') refresh_token: string
    ) {
        return this.authService.getSessions(user_id, refresh_token)
    }

    @ApiOperation({
        summary: 'Revoke a specific session',
        description: 'If the revoked session is the current one, the `refresh_token` cookie is also cleared.',
    })
    @ApiBearerAuth()
    @ApiCookieAuth('refresh_token')
    @ApiOkResponse({ description: 'Session revoked', schema: swMsg('Session revoked') })
    @Delete("/sessions")
    async revokeSession(
        @CurrentUser('sub') user_id: Types.ObjectId,
        @Body() dto: RevokeSessionDTO,
        @Cookie('REFRESH_TOKEN') refresh_token: string,
        @CurrentUser('jti') jti: string,
        @Res({ passthrough: true }) res: Response
    ) {
        res.clearCookie('refresh_token', { httpOnly: true, secure: true, sameSite: 'strict' });
        return this.authService.revokeSession(user_id, dto.session_id, refresh_token, jti)
    }

    // ─── Phone verification ───────────────────────────────────────────────────

    @ApiOperation({ summary: 'Send OTP to verify a phone number', description: 'Binds a Vietnamese phone number to the authenticated account.' })
    @ApiBearerAuth()
    @ApiOkResponse({ description: 'OTP sent to phone', schema: swMsg('OTP sent to phone') })
    @Post('/phone/send-otp')
    async sendPhoneOTP(
        @CurrentUser('sub') user_id: Types.ObjectId,
        @Body() dto: SendPhoneOTPDTO
    ) {
        return this.authService.sendPhoneOTP(user_id, dto.phone)
    }

    @ApiOperation({ summary: 'Verify the phone OTP' })
    @ApiBearerAuth()
    @ApiOkResponse({ description: 'Phone number verified and bound to account', schema: swMsg('Phone verified successfully') })
    @ApiBadRequestResponse({ description: 'Invalid or expired OTP' })
    @Post('/phone/verify-otp')
    async verifyPhoneOTP(
        @CurrentUser('sub') user_id: Types.ObjectId,
        @Body() dto: VerifyPhoneOTPDTO
    ) {
        return this.authService.verifyPhoneOTP(user_id, dto.otp)
    }

    // ─── OAuth ────────────────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Initiate OAuth login — redirects to provider login page' })
    @ApiParam({ name: 'provider', description: 'OAuth provider name', enum: ['google', 'facebook'], example: 'google' })
    @ApiResponse({ status: 302, description: 'Redirects to the OAuth provider authorization URL' })
    @Public()
    @Get('/oauth/:provider')
    async oauthLogin(@Param('provider') provider: string, @Res() res: Response) {
        const { redirect_url } = await this.authService.oauthInit(provider)
        return res.redirect(redirect_url);
    }

    @ApiExcludeEndpoint()
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
            httpOnly: true, secure: true, sameSite: 'strict',
            maxAge: this.getTimeToLifeCookies(false),
        });
        const url = this.config.client.clientUrl + "oauth/callback?access_token=" + response.access_token
        return res.redirect(url);
    }

    private getTimeToLifeCookies(rememberMe: boolean): number {
        return rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    }
}
