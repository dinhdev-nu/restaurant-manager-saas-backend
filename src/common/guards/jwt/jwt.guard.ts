import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/common/constants/redis.const';
import { PROTECTED_KEY } from 'src/common/decorator/protected.decorator';
// import { InjectModel } from '@nestjs/mongoose';
// import Redis from 'ioredis';
// import { Model } from 'mongoose';
// import { Observable } from 'rxjs';
// import { REDIS_CLIENT } from 'src/common/constants/redis.const';
import { UnauthorizedException } from 'src/common/exceptions/http-exception';
import { JWTPayloadAT } from 'src/modules/auth/auth.service';
import { SessionDocument } from 'src/modules/auth/schema/session.schema';
import { UserDocument } from 'src/modules/auth/schema/user.schema';
// import { Session, SessionDocument } from 'src/modules/auths/schema/session.schema';


export class UserHeaderRequest {
  ATPayload: JWTPayloadAT
  info: UserDocument
  session: SessionDocument
}

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isProtected = this.reflector.get<boolean>(PROTECTED_KEY, context.getHandler());
    if (!isProtected) return true; // Skip guard for public routes
    const request = context.switchToHttp().getRequest();

    const header = request.headers['authorization'] || "";

    const token = header.split(" ")[1];
    if (!token) 
      throw new UnauthorizedException("Missing access token");

    let payload: JWTPayloadAT;
    try {
      payload = this.jwt.verify(token, { secret: process.env.JWT_ACCESS_SECRET });
    } catch (error) {
      throw new UnauthorizedException("Invalid or expired access token");
    }

    const { sub, sid } = payload;
    const key = `auth:${sub}:${sid}`; 
    const rawData = await this.redis.get(key);
    const data = JSON.parse(rawData!) as UserHeaderRequest;

    request.user = {
      ATPayload: payload,
      info: data.info,
      session: data.session
    } as UserHeaderRequest;
    return true
  }
}


// @Injectable()
// export class JwtGuard implements CanActivate {
//   constructor(
//     private readonly jwt: JwtService,
//     @Inject(REDIS_CLIENT) private readonly redis: Redis,
//     @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
//   ) {}

//   async canActivate(context: ExecutionContext): Promise<boolean> {
//     const request = context.switchToHttp().getRequest();
//     const header = request.headers['authorization'] || "";
//     const token = header.split(" ")[1];

//     if (!token) throw new UnauthorizedException("Missing access token");

//     let payload: any;
//     try {
//       payload = this.jwt.verify(token);
//       request.user = payload;
//     } catch {
//       throw new UnauthorizedException("Invalid or expired access token");
//     }

//     const sid = payload.sid;
//     if (!sid) throw new UnauthorizedException("Invalid access token");

//     const sessionKey = `auth:${payload.sub}:${sid}`;
//     let sessionValue: any = await this.redis.get(sessionKey);

//     if (!sessionValue) {
//       sessionValue = await this.sessionModel.findOne({ sid }).lean();
//     }

//     if (!sessionValue || !sessionValue.isValid) {
//       throw new UnauthorizedException("Session revoked or not found");
//     }

//     request.session = sessionValue;
//     return true;
//   }
// }
