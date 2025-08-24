import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthsService } from './auths.service';
import { LoginDto, RegisterDTO, VerifyOtpDTO } from './dto/auth.dto';
import { Request } from 'express';
import { JwtGuard } from 'src/common/guards/jwt/jwt.guard';

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

  @Get("/verify-otp")
  verifyOtp(@Body() verifyOtpDto: VerifyOtpDTO): Promise<boolean> {
    return this.authsService.verifyOtp(verifyOtpDto)
  }

  @Post("/signup")
  signup(@Body() registerDto: RegisterDTO): Promise<boolean> {
    return this.authsService.signup(registerDto);
  }

  @Post("/login")
  login(
    @Body() loginDto: LoginDto,
    @Req() req: Request
  ) {
    loginDto.ip = req.ip
    return this.authsService.login(loginDto); 
  }

  @Post("/refresh")
  refreshToken(@Body('refreshToken') refreshToken: string): Promise<{ accessToken: string, refreshToken: string }> {
    return this.authsService.refreshToken(refreshToken);
  }

  @UseGuards(JwtGuard)
  @Post("/logout")
  logout(@Req() req: Request): Promise<boolean> {
    return this.authsService.logout(req["user"]);
  }

}
