import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthsService } from './auths.service';
import { LoginDto, RegisterDTO, SignupDTO, VerifyOtpDTO } from './dto/auth.dto';
import { Request, Response, response } from 'express';
import { JwtGuard } from 'src/common/guards/jwt/jwt.guard';
import { UnauthorizedException } from 'src/common/exceptions/http-exception';

@Controller('auths')
export class AuthsController {

  constructor(private readonly authsService: AuthsService) {}

  @Post("/register")
  getUser(@Body() registerDto: RegisterDTO): Promise<string> {
    return this.authsService.register(registerDto)
  }

  @Post("/send-otp")
  sendOtp(@Body() registerDto: RegisterDTO): Promise<boolean> {
    return this.authsService.sendOtp(registerDto)
  }

  @Post("/verify-otp")
  verifyOtp(@Body() verifyOtpDto: VerifyOtpDTO): Promise<boolean> {
    return this.authsService.verifyOtp(verifyOtpDto)
  }

  @Post("/signup")
  signup(@Body() signupDto: SignupDTO): Promise<Boolean> {
    return this.authsService.signup(signupDto)
  }

  @Post("/login")
  async login(@Body() loginDto: LoginDto, @Res() res: Response): Promise<any> {
    const loginPayload = { ...loginDto, ip: loginDto.ip || (res.req as Request).ip } as LoginDto;
    const data = await this.authsService.login(loginPayload);

    // Set HttpOnly cookies
    res.cookie('RT', data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Set to true in production
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })

    // Remove RT from response body
    data.refreshToken = "";

    return data;
  }

  @UseGuards(JwtGuard)
  @Post("/logout")
  logout(@Req() req: Request, @Res() res: Response): Promise<boolean> {
    const user = req['user'] as any;
    res.clearCookie('RT');
    return this.authsService.logout(user.sub, user.sid);
  }

  @UseGuards(JwtGuard)
  @Post("/revoke-sessions")
  revokeSessions(@Req() req: Request, @Res() res: Response): Promise<boolean> {
    const user = req['user'] as any;
    res.clearCookie('RT');
    return this.authsService.revokeUserSessions(user.sub);
  }

  @Post("/refresh")
  async refresh(@Req() req: Request, @Res() res: Response): Promise<{ accessToken: string }> {
    const rt = req.cookies['RT'];
    if (!rt) throw new UnauthorizedException("Missing refresh token");
  
    const newSession = await this.authsService.refreshToken(rt);
    res.cookie('RT', newSession.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Set to true in production
      sameSite: 'strict', // Cùng domain
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return { accessToken: newSession.accessToken };
  }

  @Get("/google")
  async googleAuth(@Res() res: Response) {
    const url = this.authsService.getGoogleAuthUrl();
    return res.redirect(url);
  }

  @Get("/google/callback")
  async googleAuthCallback(@Query('code') code: string,@Req() req: Request, @Res() res: Response) {

    const session = await this.authsService.loginWithGoogle(code, req.ip)

    // SetCookies 
    res.cookie('RT', session.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Set to true in production
      sameSite: 'strict', // Cùng domain
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })
    session.refreshToken = "";
    res.cookie('SS', JSON.stringify(session), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 1000
    });

    return res.redirect(process.env.CLIENT_URL! + `auth?provider=google`);
  }

}
