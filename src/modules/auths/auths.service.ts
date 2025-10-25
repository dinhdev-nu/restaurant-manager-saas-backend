import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { LoginDto, RegisterDTO, SignupDTO, VerifyOtpDTO } from './dto/auth.dto';
import { BadRequestException, ForbiddenException } from 'src/common/exceptions/http-exception';
import { CompareOTPs, GenerateOTP, isValidOTP } from 'src/common/utils/otp.util';
import { REDIS_CLIENT } from 'src/common/constants/redis.const';
import Redis from 'ioredis';
import { User, UserDocument } from './schema/user.schema';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { ComparePassword, GenerateSalt, HashPassword } from 'src/common/utils/auth.util';
import { Session } from 'inspector/promises';
import { SessionDocument } from './schema/session.schema';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';


type OTPCache = {
  OTP: string;
  FailCount: number
}

type JWTPayloadAT = { sid: string, sub: string, roles: string[] }
type JWTPayloadRT = { sid: string, sub: string, version: number, jti: string, roles?: string[] }


export type SessionOut = { 
  accessToken: string,
  refreshToken?: string,
  user: UserDocument
}



@Injectable()
export class AuthsService {

  private readonly CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  private readonly CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  private readonly REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
  private readonly OAUTH_URL = `https://accounts.google.com/o/oauth2/v2/auth?`;

  private readonly JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET
  private readonly JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL
  private readonly JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET
  private readonly JWT_REFRESH_TTL = process.env.JWT_REFRESH_TTL
 

  constructor(
    private readonly jwtAccessService: JwtService,
    private readonly jwtRefreshService: JwtService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
    private readonly mailService: MailService
  ) {}

  async register(registerDto: RegisterDTO): Promise<string> {

    if(registerDto.email === undefined && registerDto.phone === undefined) {
      throw new BadRequestException('Email or phone is required');
    }

    // Check user exists
    const orConditions: { email?: string; phone?: string }[] = [];
    if (registerDto.email) {
      orConditions.push({ email: registerDto.email })
    }
    if (registerDto.phone) {
      orConditions.push({ phone: registerDto.phone })
    }

    const query: any = { isActive: true }
    if (orConditions.length > 0) {
      query.$or = orConditions
    }
    const isUserExists = await this.userModel.findOne(query).lean();
    if (isUserExists) {
      throw new BadRequestException("Email or Phone already exists");
    }

    return registerDto.email || registerDto.phone;
  }

  async sendOtp(registerDto: RegisterDTO): Promise<boolean> {
    // Check if email or phone is provided
    if (!registerDto.email && !registerDto.phone) {
      throw new BadRequestException('Email or phone is required');
    }
    
    const cacheOtp = await this.redis.get(`auth:otp:${registerDto.email || registerDto.phone}`);
    if (cacheOtp) throw new BadRequestException('OTP already sent. Please wait before requesting a new one.');

    // Generate new OTP
    const otp = GenerateOTP()

    // Check cache exists or reset otp counts
    const newOtpCache: OTPCache = {
      OTP: otp,
      FailCount: 0
    }

    // help avoid client spams
    this.redis.set(`auth:otp:${registerDto.email || registerDto.phone}`, JSON.stringify(newOtpCache), 'EX', 60 * 5)

    // Send OTP 
    // Sent by Email 
    if (registerDto.email) {
      await this.mailService.sendOtpMail(registerDto.email, 'Xác thực OTP', otp)
    } else if (registerDto.phone) {
      throw new BadRequestException('SMS service not implemented yet');
    }

    return true
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDTO): Promise<boolean> {
    // Check if OTP is valid
    const isValid = isValidOTP(verifyOtpDto.otp);
    if (!isValid) throw new BadRequestException('Invalid OTP');

    // Get cached OTP
    const cachedOtp = await this.redis.get(`auth:otp:${verifyOtpDto.accountName}`);

    if (!cachedOtp) throw new BadRequestException('OTP expired or not found');

    const { OTP, FailCount } = JSON.parse(cachedOtp);

    // Check OTP fail count
    if (FailCount >= 3) {
      await this.redis.del(`auth:otp:${verifyOtpDto.accountName}`);
      throw new BadRequestException('OTP expired or not found');
    }

    // Compare with cached OTP
    if(!CompareOTPs(OTP, verifyOtpDto.otp)) {
      await this.redis.set(`auth:otp:${verifyOtpDto.accountName}`, JSON.stringify({ OTP, FailCount: FailCount + 1 }), 'EX', 60 * 5);
      throw new BadRequestException('Invalid OTP');
    }

    await this.redis.del(`auth:otp:${verifyOtpDto.accountName}`);
    return true;
  }

  async signup(signupDto: SignupDTO): Promise<boolean> {

    if(signupDto.email === undefined && signupDto.phone === undefined) throw new BadRequestException('Email or phone is required');

    const localSalt = await GenerateSalt() ;
    const passwordHash = await HashPassword(signupDto.password, localSalt);

    await this.userModel.create({
      email: signupDto.email,
      phone: signupDto.phone,
      isActive: true,
      roles: ['customer'],
      providers: ['local'],
      password: passwordHash,
      user_name: signupDto.email ? signupDto.email.split('@')[0] : ( signupDto.phone ? signupDto.phone : 'user' ),
    });

    return true;
  }

  async login(loginDto: LoginDto): Promise<SessionOut> {

    // Check if email or phone is provided
    if (!loginDto.email && !loginDto.phone) 
      throw new BadRequestException('Email or phone is required');

    // Find User by email or phone
    const query: any = { active: true }
    const orConditions: { email?: string; phone?: string }[] = [];
    if (loginDto.email) {
      orConditions.push({ email: loginDto.email })
    } 
    if (loginDto.phone) {
      orConditions.push({ phone: loginDto.phone })
    }

    query.$or = orConditions;
    const user = await this.userModel.findOne(query);

    // Check User
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.providers.includes('local')) throw new UnauthorizedException('User not registered with local provider');
    if (!user.isActive) throw new ForbiddenException('User is inactive');

    // Check Password
    const isPasswordMatch = await ComparePassword(loginDto.password, user.password || '');
    if (!isPasswordMatch) throw new UnauthorizedException('Invalid password');

    // Create Session
    const { accessToken, refreshToken } = await this.createSession(user, user._id.toString(), loginDto.ip, '');


    return { accessToken, refreshToken, user }
  } 

  async logout(userId: string, sid: string): Promise<boolean> {
    // Delete session
    await this.sessionModel.updateOne({ userID: new Types.ObjectId(userId), sid, isValid: true }, { isValid: false });
    // Delete cached sessions
    await this.redis.keys(`auth:${userId}:${sid}`);

    return true;
  }

  async revokeUserSessions(userId: string): Promise<true> {
    await this.sessionModel.updateMany({ userID: new Types.ObjectId(userId), isValid: true }, { isValid: false });
    await this.redis.keys(`auth:${userId}:*`);
    return true;
  }

  async refreshToken(token: string): Promise<{ accessToken: string, refreshToken: string }> {

    let payload: JWTPayloadRT;
    try {
      payload = this.jwtRefreshService.verify(token);
    } catch(e) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Find Session 
    const session = await this.sessionModel.findOne({
      sid: payload.sid,
      userID: new Types.ObjectId(payload.sub),
      isValid: true,
    })

    if (!session) throw new UnauthorizedException('Session not found');

    // Compare refresh token
    const isTokenMatch = await bcrypt.compare(token, session.refreshTokenHash || '');
    if (!isTokenMatch) throw new UnauthorizedException('Invalid refresh token');

    // Check token version 
    if (payload.version !== session.version) throw new UnauthorizedException('Token has been revoked');

    // Create new token 
    const newAccessTokenPayload: JWTPayloadAT = {
      sid: session.sid,
      sub: session.userID.toString(),
      roles: payload.roles || []
    }
    const newAccessToken = this.jwtAccessService.sign(newAccessTokenPayload, { expiresIn : '15m' });

    const newRefreshTokenPayload: JWTPayloadRT = {
      sid: session.sid,
      sub: session.userID.toString(),
      version: session.version + 1,
      jti: randomUUID(),
      roles: payload.roles || []
    }
    const newRefreshToken = this.jwtAccessService.sign(newRefreshTokenPayload, { expiresIn : '7d' });
    
    // Update session
    session.refreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
    session.version += 1;
    await session.save();

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async createSession(user: UserDocument, userId: string, ip?: string, userAgent?: string): Promise<{ accessToken: string; refreshToken: string; }> {

    const sid = randomUUID();

    // AccessToken 
    const payloadAT: JWTPayloadAT = {
      sid,
      sub: userId,
      roles: user.roles
    }
    const accessToken = this.jwtAccessService.sign(payloadAT, { expiresIn: this.JWT_ACCESS_TTL, secret: this.JWT_ACCESS_SECRET });

    // RefreshToken 
    const patloadRT: JWTPayloadRT = {
      sid,
      sub: userId,
      version: 0,
      jti: randomUUID(),
      roles: user.roles
    }
    const refreshToken = this.jwtRefreshService.sign(patloadRT, { expiresIn: this.JWT_REFRESH_TTL, secret: this.JWT_REFRESH_SECRET });

    // Save session to DB
    const resfreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const session = await this.sessionModel.create({ 
      userID: new Types.ObjectId(userId),
      sid,
      refreshToken: resfreshTokenHash,
      ip,
      userAgent,
      version: 0,
      expiredAt: expiresAt
    })

    // Cache accessToken 
    this.redis.set(`auth:${userId}:${sid}`, JSON.stringify(session), 'EX', 60 * 15); // 15 minutes
    
    return { accessToken, refreshToken };
  }

  getGoogleAuthUrl(): string {
    const googleAuthUrl = 
      this.OAUTH_URL +
      new URLSearchParams({
        client_id: this.CLIENT_ID || '',
        redirect_uri: this.REDIRECT_URI || '',
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'consent'
      }).toString();
      return googleAuthUrl;
  }

  async loginWithGoogle(code: string, ip?: string, userAgent?: string): Promise<SessionOut> {

    // Get Token 
    const vales = {
      code,
      client_id: this.CLIENT_ID,
      client_secret: this.CLIENT_SECRET,
      redirect_uri: this.REDIRECT_URI,
      grant_type: 'authorization_code'
    }

    const res = await fetch( "https://oauth2.googleapis.com/token" , {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(vales as any).toString()
    });

    const data = await res.json();

    // Get user info 
    const userInfoRess = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${data.access_token}`
      }
    });

    const userGoogleProfile = await userInfoRess.json();
    const { email, name, picture, sub } = userGoogleProfile
    console.log(userGoogleProfile);

    // Check user exists 
    let user = await this.userModel.findOne({ email });

    if (!user) {
      // Tạo mới user 
      user = await this.userModel.create({
        user_name: name, 
        avatar: picture,
        email,
        providers: 'google',
        providerId: sub,
      })
    } else {
      if (!user.providers.includes("google")) throw new UnauthorizedException("Please link the email in setting!")
      if (!user.isActive) {
        user.isActive = true
        user.save()
      }
    }

    // Create sesion 
    const sid = randomUUID()

    // Gen token 
    const payloadAT: JWTPayloadAT = {
      sid,
      sub: user._id.toString(),
      roles: user.roles
    }
    const accessToken = this.jwtAccessService.sign(payloadAT, { expiresIn: this.JWT_ACCESS_TTL, secret: this.JWT_ACCESS_SECRET });

    const patloadRT: JWTPayloadRT = {
      sid,
      sub: user._id.toString(),
      version: 0,
      jti: randomUUID()
    }
    const refreshToken = this.jwtRefreshService.sign(patloadRT, { expiresIn: this.JWT_REFRESH_TTL, secret: this.JWT_REFRESH_SECRET });
    const rfTokenHash = await bcrypt.hash(refreshToken, 10)
    const expiredAt = new Date()
    expiredAt.setDate(expiredAt.getDate() + 7)

    await this.sessionModel.create({
      userID: user._id,
      sid,
      refreshTokenHash: rfTokenHash,
      ip,
      userAgent,
      expiredAt
    })

    return { accessToken, refreshToken, user}

  }
 
  async getUserById(id: string): Promise<UserDocument | null> {
    const user = await this.userModel.findById(new Types.ObjectId(id));
    return user;
  }

}




