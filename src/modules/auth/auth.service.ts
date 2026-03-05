import { Inject, Injectable } from '@nestjs/common';
import { LoginDto, RegisterDTO, SignupDTO, VerifyOtpDTO } from './dto/auth.dto';
import Redis from 'ioredis';
import { User, UserDocument } from './schema/user.schema';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Session, SessionDocument } from './schema/session.schema';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import { randomUUID } from 'crypto';
import { JWTPayloadAT, JWTPayloadRT, UserHeaderRequest } from './auth.types';
import { INJECTION_TOKEN } from 'src/common/constants/injection-token.constant';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from 'src/common/exceptions';
import { ERROR_CODE } from 'src/common/constants/error-code.constant';
import { OtpUtils } from 'src/common/utils/otp.util';
import { InternalServerException } from 'src/common/exceptions/http/internal-server.exception';
import { TooManyRequestException } from 'src/common/exceptions/http/too-many-requests.exception';
import { HashUtil } from 'src/common/utils/hash.util';
import { ROLE } from 'src/common/constants/role.constant';

export type { JWTPayloadAT, JWTPayloadRT, UserHeaderRequest };

type OTPCache = {
  OTP: string;
  FailCount: number
}


export type SessionOut = { 
  accessToken: string,
  refreshToken?: string,
  user: UserDocument
}

@Injectable()
export class AuthService {

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
    @Inject(INJECTION_TOKEN.REDIS_CLIENT) private readonly redis: Redis,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
    private readonly mailService: MailService
  ) {}

  async register(dto: RegisterDTO): Promise<string> {

    if(dto.email === undefined && dto.phone === undefined) {
      throw new BadRequestException(ERROR_CODE.INVALID_INPUT_ERROR, 'Email or phone is required');
    }

    // Check user exists
    const orConditions: { email?: string; phone?: string }[] = [];
    if (dto.email) {
      orConditions.push({ email: dto.email })
    }
    if (dto.phone) {
      orConditions.push({ phone: dto.phone })
    }

    const query: any = { isActive: true }
    if (orConditions.length > 0) {
      query.$or = orConditions
    }
    const isUserExists = await this.userModel.findOne(query).lean();
    if (isUserExists) {
      throw new ConflictException(ERROR_CODE.USER_EXISTS, 'Email or Phone already exists');
    }

    return dto.email || dto.phone;
  }

  async sendOtp(dto: RegisterDTO): Promise<boolean> {
    // Check if email or phone is provided
    if (!dto.email && !dto.phone) {
      throw new BadRequestException(ERROR_CODE.INVALID_INPUT_ERROR, 'Email or phone is required');
    }
    
    const cacheOtp = await this.redis.get(`auth:otp:${dto.email || dto.phone}`);
    if (cacheOtp) throw new ConflictException(ERROR_CODE.DUPLICATE_ITEMS, 'OTP already sent. Please wait before requesting a new one.');

    // Generate new OTP
    const otp = OtpUtils.generateOTP();

    // Check cache exists or reset otp counts
    const newOtpCache: OTPCache = {
      OTP: otp,
      FailCount: 0
    }

    // help avoid client spams
    this.redis.set(`auth:otp:${dto.email || dto.phone}`, JSON.stringify(newOtpCache), 'EX', 60 * 5)

    // Send OTP 
    // Sent by Email 
    if (dto.email) {
      await this.mailService.sendOtpMail(dto.email, 'Xác thực OTP', otp)
    } else if (dto.phone) {
      throw new InternalServerException(ERROR_CODE.INTERNAL_ERROR, 'SMS service not implemented yet');
    }

    return true
  }

  async verifyOtp(dto: VerifyOtpDTO): Promise<boolean> {
    // Check if OTP is valid
    const isValid = OtpUtils.isValidOTP(dto.otp);
    if (!isValid) throw new BadRequestException(ERROR_CODE.INVALID_INPUT_ERROR, 'Invalid OTP');

    // Get cached OTP
    const cachedOtp = await this.redis.get(`auth:otp:${dto.accountName}`);

    if (!cachedOtp) throw new NotFoundException("OTP", dto.otp);

    const { OTP, FailCount } = JSON.parse(cachedOtp);

    // Check OTP fail count
    if (FailCount >= 3) {
      await this.redis.del(`auth:otp:${dto.accountName}`);
      throw new TooManyRequestException(
        ERROR_CODE.OTP_SEND_LIMIT_EXCEEDED, 
        'Too many failed OTP attempts. Please request a new OTP.'
      );
    }

    // Compare with cached OTP
    if(!OtpUtils.isEqual(OTP, dto.otp)) {
      await this.redis.set(`auth:otp:${dto.accountName}`, JSON.stringify({ OTP, FailCount: FailCount + 1 }), 'EX', 60 * 5);
      throw new BadRequestException(ERROR_CODE.INVALID_INPUT_ERROR, 'Invalid OTP');
    }

    await this.redis.del(`auth:otp:${dto.accountName}`);
    return true;
  }

  async signup(dto: SignupDTO): Promise<boolean> {

    if(dto.email === undefined && dto.phone === undefined) 
      throw new BadRequestException(ERROR_CODE.INVALID_INPUT_ERROR, 'Email or phone is required');

    const localSalt = await HashUtil.generateSalt() ;
    const passwordHash = await HashUtil.hashWithSalt(dto.password, localSalt);

    await this.userModel.create({
      email: dto.email,
      phone: dto.phone,
      isActive: true,
      roles: ['user'],
      password: passwordHash,
      user_name: dto.email ? dto.email.split('@')[0] : ( dto.phone ? dto.phone : 'user' ),
    });

    return true;
  }

  async login(dto: LoginDto): Promise<SessionOut> {

    // Check if email or phone is provided
    if (!dto.email && !dto.phone) 
      throw new BadRequestException(ERROR_CODE.INVALID_INPUT_ERROR, 'Email or phone is required');

    // Find User by email or phone
    const query: any = {}
    const orConditions: { email?: string; phone?: string }[] = [];
    if (dto.email) {
      orConditions.push({ email: dto.email })
    } 
    if (dto.phone) {
      orConditions.push({ phone: dto.phone })
    }

    query.$or = orConditions;

    const user = await this.userModel.findOne(query).lean();

    // Check User
    if (!user) throw new NotFoundException(User.name, dto.email || dto.phone);
    const isLocalProvider = user.providers.find(p => p.name === 'local');
    if (!isLocalProvider) throw new BadRequestException(ERROR_CODE.INVALID_INPUT_ERROR, 'User not registered with local provider');
    if (!user.isActive) throw new ForbiddenException(ERROR_CODE.FORBIDDEN, 'User is inactive');

    // Check Password
    const isPasswordMatch = await HashUtil.compare(dto.password, user.password || '');
    if (!isPasswordMatch) throw new UnauthorizedException(ERROR_CODE.UNAUTHORIZED, 'Invalid password');

    // Create Session
    const { accessToken, refreshToken } = await this.createSession(user, dto.ip, "");

    return { accessToken, refreshToken, user }
  } 

  async logout(userId: Types.ObjectId, sid: string): Promise<boolean> {
    // Delete session
    await this.sessionModel.updateOne({ userID: userId, sid, isValid: true }, { isValid: false });
    // Delete cached sessions
    await this.redis.keys(`auth:${userId}:${sid}`);

    return true;
  }

  async revokeUserSessions(userId: Types.ObjectId): Promise<true> {
    await this.sessionModel.updateMany({ userID: userId, isValid: true }, { isValid: false });
    await this.redis.keys(`auth:${userId}:*`);
    return true;
  }

  async refreshToken(token: string): Promise<{ accessToken: string, refreshToken: string }> {

    if (!token) throw new UnauthorizedException(ERROR_CODE.UNAUTHORIZED, 'Missing refresh token');

    let payload: JWTPayloadRT;
    try {
      payload = this.jwtRefreshService.verify(token, { secret: this.JWT_REFRESH_SECRET });
    } catch(e) {
      console.log(e);
      throw new UnauthorizedException( ERROR_CODE.UNAUTHORIZED, 'Invalid refresh token 1');
    }

    // Find User & Session 
    const [user, session] = await Promise.all([
      this.userModel.findById(payload.sub).lean(),
      this.sessionModel.findOne({
        userID: payload.sub,
        sid: payload.sid,
        isValid: true,
      })
    ]);

    if (!user) throw new NotFoundException(User.name, payload.sub);
    if (!session) throw new NotFoundException(Session.name, payload.sid);

    // Compare refresh token
    const isTokenMatch = await HashUtil.compare(token, session.refreshTokenHash || '');
    if (!isTokenMatch) throw new UnauthorizedException( ERROR_CODE.UNAUTHORIZED, 'Invalid refresh token 1');

    // Check token version 
    if (payload.version !== session.version) throw new UnauthorizedException( ERROR_CODE.UNAUTHORIZED, 'Token has been revoked');

    // Create new token 
    const newAccessTokenPayload: JWTPayloadAT = {
      sid: session.sid,
      sub: session.userID,
      role: user.role
    }
    const newAccessToken = this.jwtAccessService.sign(
      newAccessTokenPayload, 
      {  expiresIn: this.JWT_ACCESS_TTL, secret: this.JWT_ACCESS_SECRET }
    );

    const newRefreshTokenPayload: JWTPayloadRT = {
      sid: session.sid,
      sub: session.userID,
      version: session.version + 1,
      jti: randomUUID(),
      role: user.role
    }
    const newRefreshToken = this.jwtAccessService.sign(
      newRefreshTokenPayload, 
      {  expiresIn: this.JWT_REFRESH_TTL, secret: this.JWT_REFRESH_SECRET }
    );
    
    // Update session
    session.refreshTokenHash = await HashUtil.hash(newRefreshToken);
    session.version += 1;
    await session.save();

    // có thể cache session ở redis nếu cần verify thêm ở jwt guard
    const dataCahe = {
      info: user,
      session: session.toObject(),
      ATPayload: newAccessTokenPayload
    }
    await this.redis.set(`auth:${user._id}:${session.sid}`, JSON.stringify(dataCahe), 'EX', 60 * 16); // 16 minutes

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async createSession(user: UserDocument, ip?: string, userAgent?: string): Promise<{ accessToken: string; refreshToken: string; }> {

    const sid = randomUUID();

    // AccessToken 
    const payloadAT: JWTPayloadAT = {
      sid,
      sub: user._id,
      role: user.role
    }
    const accessToken = this.jwtAccessService.sign(payloadAT, { expiresIn: this.JWT_ACCESS_TTL, secret: this.JWT_ACCESS_SECRET });

    // RefreshToken 
    const payloadRT: JWTPayloadRT = {
      sid,
      sub: user._id,
      version: 0,
      jti: randomUUID(),
      role: user.role
    }
    const refreshToken = this.jwtRefreshService.sign(payloadRT, { expiresIn: this.JWT_REFRESH_TTL, secret: this.JWT_REFRESH_SECRET });

    // Save session to DB
    const refreshTokenHash = await HashUtil.hash(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const session = await this.sessionModel.create({ 
      userID: user._id,
      sid,
      refreshToken: refreshTokenHash,
      ip,
      userAgent,
      version: 0,
      expiredAt: expiresAt
    })

    // Cache accessToken ( ko cần nếu ko verify thêm ở jwt guard )
    const dataCahe: UserHeaderRequest = {
      info: user,
      session: session.toObject(),
      ATPayload: payloadAT
    }
    await this.redis.set(`auth:${user._id}:${sid}`, JSON.stringify(dataCahe), 'EX', 60 * 16); // 16 minutes
    
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

    // Check user exists 
    let user = await this.userModel.findOne({ email });

    if (!user) {
      // Tạo mới user 
      user = await this.userModel.create({
        user_name: name, 
        avatar: picture,
        email,
        providers: [{ name: 'google', providerId: sub }],
        isActive: true,
        role: ROLE.USER
      })
    } else {
      const isGoogleProvider = user.providers.find(p => p.name === 'google');
      if (!isGoogleProvider) throw new UnauthorizedException( ERROR_CODE.UNAUTHORIZED, "Please link the email in setting!")
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
      sub: user._id,
      role: user.role
    }
    const accessToken = this.jwtAccessService.sign(payloadAT, { expiresIn: this.JWT_ACCESS_TTL, secret: this.JWT_ACCESS_SECRET });

    const payloadRT: JWTPayloadRT = {
      sid,
      sub: user._id,
      version: 0,
      role: user.role,
      jti: randomUUID()
    }
    const refreshToken = this.jwtRefreshService.sign(payloadRT, { expiresIn: this.JWT_REFRESH_TTL, secret: this.JWT_REFRESH_SECRET });
    const rfTokenHash = await HashUtil.hash(refreshToken);
    const expiredAt = new Date()
    expiredAt.setDate(expiredAt.getDate() + 7)

    // Save session
    const session = await this.sessionModel.create({
      userID: user._id,
      sid,
      refreshTokenHash: rfTokenHash,
      ip,
      userAgent,
      expiredAt
    })

     // Cache
     const dataCahe: UserHeaderRequest = {
      info: user,
      session: session.toObject(),
      ATPayload: payloadAT
    }
     await this.redis.set(`auth:${user._id}:${sid}`, JSON.stringify(dataCahe), 'EX', 60 * 16); // 16 minutes  

    return { accessToken, refreshToken, user }

  }
 
  async getUserById(id: string): Promise<UserDocument | null> {
    const user = await this.userModel.findById(id).lean();
    return user;
  }

}




