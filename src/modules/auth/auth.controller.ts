import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { AuthService, JWTPayloadAT } from './auth.service';
import { LoginDto, RegisterDTO, SignupDTO, VerifyOtpDTO } from './dto/auth.dto';
import { Request, Response } from 'express';
import { UnauthorizedException } from 'src/common/exceptions/http-exception';
import { UserSession } from 'src/common/decorator/session.decorator';
import { UserHeaderRequest } from 'src/common/guards/jwt/jwt.guard';
import { RefreshToken } from 'src/common/decorator/refreshToken.decorator';
import { Protected } from 'src/common/decorator/protected.decorator';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  private nodeEnv: string;
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) {
    this.nodeEnv = this.configService.get<string>('server.nodeEnv') || 'development';
  }
  
  @Post("/register")
  getUser(@Body() registerDto: RegisterDTO): Promise<string> {
    return this.authService.register(registerDto)
  }

  @Post("/send-otp")
  sendOtp(@Body() registerDto: RegisterDTO): Promise<boolean> {
    return this.authService.sendOtp(registerDto)
  }

  @Post("/verify-otp")
  verifyOtp(@Body() verifyOtpDto: VerifyOtpDTO): Promise<boolean> {
    return this.authService.verifyOtp(verifyOtpDto)
  }

  @Post("/signup")
  signup(@Body() signupDto: SignupDTO): Promise<Boolean> {
    return this.authService.signup(signupDto)
  }

  @Post("/login")
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<any> {
    const loginPayload = { ...loginDto, ip: loginDto.ip || (res.req as Request).ip } as LoginDto;
    const data = await this.authService.login(loginPayload);

    // Set HttpOnly cookies
    res.cookie('RT', data.refreshToken, {
      httpOnly: true,
      secure: this.nodeEnv === 'production', // Set to true in production
      sameSite: 'lax', // cho phép khác domain
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })

    // Remove RT from response body
    data.refreshToken = "";

    return data;
  }

  @Post("/logout")
  @Protected()
  logout(@UserSession() user: UserHeaderRequest, @Res({ passthrough: true }) res: Response): Promise<boolean> {
    const payload = user.ATPayload as JWTPayloadAT;
    res.clearCookie('RT');
    return this.authService.logout(payload.sub, payload.sid);
  }

  @Post("/revoke-sessions")
  @Protected()
  revokeSessions(@UserSession() user: UserHeaderRequest, @Res({ passthrough: true }) res: Response): Promise<boolean> {
    const payload = user.ATPayload as JWTPayloadAT;
    res.clearCookie('RT');
    return this.authService.revokeUserSessions(payload.sub);
  }

  @Post("/refresh")
  async refresh(@RefreshToken() rfCookies: string, @Res({ passthrough: true }) res: Response): Promise<{ accessToken: string }> {
    if (!rfCookies) throw new UnauthorizedException("Missing refresh token");
    const newSession = await this.authService.refreshToken(rfCookies);
    res.cookie('RT', newSession.refreshToken, {
      httpOnly: true,
      secure: this.nodeEnv === 'production', // Set to true in production
      sameSite: 'lax', // cho phép khác domain // Cùng domain
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return { accessToken: newSession.accessToken };
  }

  @Get("/google")
  async googleAuth(@Res() res: Response) {
    const url = this.authService.getGoogleAuthUrl();
    return res.redirect(url);
  }

  @Get("/google/callback")
  async googleAuthCallback(@Query('code') code: string,@Req() req: Request, @Res() res: Response) {

    const session = await this.authService.loginWithGoogle(code, req.ip)

    // SetCookies 
    res.cookie('RT', session.refreshToken, {
      httpOnly: true,
      secure: this.nodeEnv === 'production', // Set to true in production
      sameSite: 'lax', // cho phép khác domain
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })
    session.refreshToken = "";
    res.cookie('SS', JSON.stringify(session), {
      httpOnly: false,
      secure: this.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 60 * 1000
    });

    res.redirect(process.env.CLIENT_URL! + `auth?provider=google`);
  }
}
