import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { LoginDto, RegisterDTO, VerifyOtpDTO } from './dto/auth.dto';
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


type OTPCache = {
  OTP: string;
  FailCount: number
}

type JWTPayloadAT = { sub: string, roles: string[] }
type JWTPayloadRT = { sub: string, sid: string, version: number, jti: string}




@Injectable()
export class AuthsService {

  constructor(
    private readonly jwtAccessService: JwtService,
    @Inject("JWT_REFRESH_SECRET") private readonly jwtRefreshService: JwtService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>
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

    // Cache user with expiration before complete verify otp step
    const newUser: User = new this.userModel({
      user_name: registerDto.email || registerDto.phone,
      email: registerDto.email,
      phone: registerDto.phone,
      provider: 'local'
    })

    await this.redis.set(`auth:register:${registerDto.email || registerDto.phone}`, JSON.stringify(newUser), 'EX', 60 * 60)

    return registerDto.email || registerDto.phone;
  }

  async sendOtp(registerDto: RegisterDTO): Promise<boolean> {
    // Check if email or phone is provided
    if (!registerDto.email && !registerDto.phone) {
      throw new BadRequestException('Email or phone is required');
    }
    
    // Generate new OTP
    const otp = GenerateOTP()

    // Check cache exists or reset otp counts
    const newOtpCache: OTPCache = {
      OTP: otp,
      FailCount: 0
    }
    await this.redis.set(`auth:otp:${registerDto.email || registerDto.phone}`, JSON.stringify(newOtpCache), 'EX', 60 * 5);

    // Send OTP 
    // Sent by Email 

    // Send by SMS Phone

    console.log(`Sending OTP ${otp} to ${registerDto.email || registerDto.phone}`);
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

  async signup(registerDto: RegisterDTO): Promise<boolean> {
    // Check if email is provided
    const user = await this.redis.get(`auth:register:${registerDto.email || registerDto.phone}`);
    if (!user) {
      throw new BadRequestException('User not found or expired');
    }

    const newUser = JSON.parse(user) as User;

    const localSalt = await GenerateSalt() ;
    newUser.salt = localSalt;
    newUser.password = await HashPassword(registerDto.password, localSalt);

    await this.userModel.create(newUser);

    return true;
  }

  async login(loginDto: LoginDto) {
    // check user exits
    const orConditions: { email?: string; phone?: string }[] = [];
    if (loginDto.email) {
      orConditions.push({ email: loginDto.email })
    }
    if (loginDto.phone) {
      orConditions.push({ phone: loginDto.phone })
    }

    const query: any = { isActive: true, email: loginDto.email }
    // if (orConditions.length > 0) {
    //   query.$or = orConditions
    // }
    const user = await this.userModel.findOne(query);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // check password 
    if (!user.password) throw new BadRequestException('Server not suport Oauth2 yet!'); 
    const isPasswordValid = await ComparePassword(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Invalid password');
    }

    // Create a session 

    const newSession = await this.sessionModel.create({
      userID: user._id,
      ip: loginDto.ip,
      expiredAt: new Date(Date.now() + this.parseTTL(process.env.JWT_REFRESH_TTL || '7d')) // default 7d
    })

    // generate token 
    const payloadAT: JWTPayloadAT = {
      sub: user._id.toString(),
      roles: user.roles
    }
    const accessToken = this.jwtAccessService.sign(payloadAT)

    const payloadRT: JWTPayloadRT = {
      sub: user._id.toString(),
      sid: newSession._id.toString(),
      version: 0,
      jti: new Types.ObjectId().toString() // Generate a unique identifier for the refresh token
    }
    const refreshToken = this.jwtRefreshService.sign(payloadRT)

    newSession.refreshToken = refreshToken;
    await newSession.save()



    return {
      accessToken,
      refreshToken
    }

  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string, refreshToken: string }> {
    let payloadRT: JWTPayloadRT;
    
    // verify refreshtoken 
    try {
      payloadRT = this.jwtRefreshService.verify(refreshToken);
    } catch (error) {
      console.log(error);
      throw new UnauthorizedException('Invalid refresh token');
    }

    // check user and session 
    const [user, session] = await Promise.all([
      this.userModel.findById(this.convertStringToObjectId(payloadRT.sub)).lean(),
      this.sessionModel.findById(this.convertStringToObjectId(payloadRT.sid))
    ])

    if (!user || !session || !session.isValid ) throw new UnauthorizedException('User or session not found'); 

    // check version 
    if (payloadRT.version !== session.version) {
      // revoke token 
      session.isValid = false;
      await session.save();
      throw new ForbiddenException('Token has been revoked');
    }

    if (session.refreshToken !== refreshToken) {
      // revoke token
      session.isValid = false;
      await session.save();
      throw new ForbiddenException('Token has been revoked');
    }

    // refresh new token 
    session.version += 1;
    const newPayloadRT: JWTPayloadRT = {
      sub: payloadRT.sub,
      sid: payloadRT.sid,
      version: session.version + 1,
      jti: payloadRT.jti
    }
    const newRefreshToken = this.jwtRefreshService.sign(newPayloadRT);
    session.refreshToken = newRefreshToken;
    await session.save();


    const newPayloadAT: JWTPayloadAT = {
      sub: user._id.toString(),
      roles: user.roles
    }
    const newAccessToken = this.jwtAccessService.sign(newPayloadAT);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    }
  }

  async logout(user: JWTPayloadAT): Promise<boolean> {
    const result = await this.sessionModel.deleteMany({ userID: new Types.ObjectId(user.sub) });
    return result.deletedCount > 0;
  }

  parseTTL(ttl: string): number {
    const match = ttl.match(/^(\d+)([smhd])$/);
    if (!match) throw new BadRequestException('Invalid TTL format');

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 1000 * 60;
      case 'h':
        return value * 1000 * 60 * 60;
      case 'd':
        return value * 1000 * 60 * 60 * 24;
      default:
        throw new BadRequestException('Invalid TTL format');
    }
  }

  convertStringToObjectId(id: string): Types.ObjectId {
    return new Types.ObjectId(id);
  }


  async getUserById(id: string): Promise<UserDocument | null> {
    const user = await this.userModel.findById(this.convertStringToObjectId(id));
    return user;
  }

}




