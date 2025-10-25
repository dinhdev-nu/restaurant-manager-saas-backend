import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
// import { InjectModel } from '@nestjs/mongoose';
// import Redis from 'ioredis';
// import { Model } from 'mongoose';
// import { Observable } from 'rxjs';
// import { REDIS_CLIENT } from 'src/common/constants/redis.const';
import { UnauthorizedException } from 'src/common/exceptions/http-exception';
// import { Session, SessionDocument } from 'src/modules/auths/schema/session.schema';


@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers['authorization'] || "";
    const token = header.split(" ")[1];

    if (!token) throw new UnauthorizedException("Missing access token");

    try {
      const payload = this.jwt.verify(token);
      request.user = payload; // { sub, sid, roles }
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
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
