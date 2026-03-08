import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { AuthService, JWTPayloadAT } from './auth.service';
import { LoginDto, RegisterDTO, SignupDTO, VerifyOtpDTO } from './dto/auth.dto';
import { Request, Response } from 'express';
import { AppConfigService } from 'src/config/config.service';
import { CurrentUser, Public } from 'src/common/decorators';
import { Cookie } from 'src/common/decorators';
import { SkipThrottle, ThrottleCustom } from 'src/common/decorators/throttler/throttler.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfigService
  ) {}

  @Public()
  @ThrottleCustom('register', { ttl: 60000, limit: 2 })
  @Post("/register")
  getUser(@Body() dto: RegisterDTO): Promise<string> {
    return this.authService.register(dto)
  }
  @Public()
  @SkipThrottle({ global: true })
  @Post("/test")
  test(): string { 
    return "Hello world"
  }

  @Public()
  @Post("/send-otp")
  sendOtp(@Body() dto: RegisterDTO): Promise<boolean> {
    return this.authService.sendOtp(dto)
  }

  @Public()
  @Post("/verify-otp")
  verifyOtp(@Body() dto: VerifyOtpDTO): Promise<boolean> {
    return this.authService.verifyOtp(dto)
  }

  @Public()
  @Post("/signup")
  signup(@Body() dto: SignupDTO): Promise<Boolean> {
    return this.authService.signup(dto)
  }

  @Public()
  @Post("/login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<any> {
    const loginPayload = { ...dto, ip: dto.ip || (res.req as Request).ip } as LoginDto;
    const data = await this.authService.login(loginPayload);

    // Set HttpOnly cookies
    res.cookie('RT', data.refreshToken, {
      httpOnly: true,
      secure: this.config.isProduction, // Set to true in production
      sameSite: 'lax', // cho phép khác domain 
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })

    // Remove RT from response body
    data.refreshToken = "";

    return data;
  }

  @Post("/logout")
  logout(@CurrentUser('PAYLOAD') payload: JWTPayloadAT, @Res({ passthrough: true }) res: Response): Promise<boolean> {
    res.clearCookie('RT');
    return this.authService.logout(payload.sub, payload.sid);
  }

  @Post("/revoke-sessions")
  revokeSessions(@CurrentUser('PAYLOAD') payload: JWTPayloadAT, @Res({ passthrough: true }) res: Response): Promise<boolean> {
    res.clearCookie('RT');
    return this.authService.revokeUserSessions(payload.sub);
  }

  @Public()
  @Post("/refresh")
  async refresh(@Cookie('REFRESH_TOKEN') token: string, @Res({ passthrough: true }) res: Response): Promise<{ accessToken: string }> {
    const newSession = await this.authService.refreshToken(token);
    res.cookie('RT', newSession.refreshToken, {
      httpOnly: true,
      secure: this.config.isProduction, // Set to true in production
      sameSite: 'lax', // cho phép khác domain // Cùng domain
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return { accessToken: newSession.accessToken };
  }

  @Public()
  @Get("/google")
  async googleAuth(@Res() res: Response) {
    const url = this.authService.getGoogleAuthUrl();
    return res.redirect(url);
  }

  @Public()
  @Get("/google/callback")
  async googleAuthCallback(@Query('code') code: string,@Req() req: Request, @Res() res: Response) {

    const session = await this.authService.loginWithGoogle(code, req.ip)

    // SetCookies 
    res.cookie('RT', session.refreshToken, {
      httpOnly: true,
      secure: this.config.isProduction  , // Set to true in production
      sameSite: 'lax', // cho phép khác domain
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })
    session.refreshToken = "";
    res.cookie('SS', JSON.stringify(session), {
      httpOnly: false,
      secure: this.config.isProduction,
      sameSite: 'lax',
      maxAge: 60 * 1000
    });

    res.redirect(process.env.CLIENT_URL! + `auth?provider=google`);
  }
}
