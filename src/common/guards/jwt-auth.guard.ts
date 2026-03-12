import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { INJECTION_TOKEN } from 'src/common/constants/injection-token.constant';
import { IS_PUBLIC_KEY } from '../decorators/auth/public.decorator';
import { UnauthorizedException } from '../exceptions';
import { ERROR_CODE } from '../constants/error-code.constant';
import { AppConfigService } from 'src/config/config.service';
import { Request } from 'express';
import { AccessTokenPayload, JWT_BLACKLIST_PREFIX } from 'src/modules/auth/auth.service.xxx';

const AUTHORIZATION = "authorization";
export const USER = "user";

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly config: AppConfigService,
    @Inject(INJECTION_TOKEN.REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check decorator
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    
    if (isPublic) return true; // Skip guard for public routes

    const req = context.switchToHttp().getRequest<Request>();
    const authorization = req.headers[AUTHORIZATION] || "";

    const token = authorization.split(" ")[1];
    if (!token) 
      throw new UnauthorizedException(ERROR_CODE.UNAUTHORIZED, "Không tìm thấy token");

    let payload: AccessTokenPayload;
    try {
      payload = this.jwt.verify(token, { secret: this.config.jwt.accessSecret });
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        throw new UnauthorizedException(ERROR_CODE.TOKEN_EXPIRED, "Token hết hạn, hãy refresh");
      }
      throw new UnauthorizedException(ERROR_CODE.UNAUTHORIZED, "Token không hợp lệ");
    }

     // Check backlist
    const backlistKey = `${JWT_BLACKLIST_PREFIX}${payload.jti}`;
    const isBlacklisted = await this.redis.get(backlistKey);
    if (isBlacklisted) {
      throw new UnauthorizedException(ERROR_CODE.UNAUTHORIZED, "Phiên đã bị thu hồi");
    }

    req[USER] = payload;
    
    return true;
  }
}