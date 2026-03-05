import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { INJECTION_TOKEN } from 'src/common/constants/injection-token.constant';
import { JWTPayloadAT, UserHeaderRequest } from 'src/modules/auth/auth.types';
import { IS_PUBLIC_KEY } from '../decorators/auth/public.decorator';
import { UnauthorizedException } from '../exceptions';
import { ERROR_CODE } from '../constants/error-code.constant';
import { AppConfigService } from 'src/config/config.service';
import { Request } from 'express';

export { UserHeaderRequest };
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
      throw new UnauthorizedException(ERROR_CODE.UNAUTHORIZED, "Missing access token");

    let payload: JWTPayloadAT;
    try {
      payload = this.jwt.verify(token, { secret: this.config.jwt.accessSecret });
    } catch (err) {
      switch (err.name) {
        case "JsonWebTokenError":
          throw new UnauthorizedException(ERROR_CODE.UNAUTHORIZED, "Invalid access token");
        case "TokenExpiredError":
          throw new UnauthorizedException(ERROR_CODE.TOKEN_EXPIRED, "Token expired");
        default: 
          throw new UnauthorizedException(ERROR_CODE.UNAUTHORIZED, "Unauthorized");
      }
     }

    const { sub, sid } = payload;
    const key = `auth:${sub}:${sid}`; 
    const rawData = await this.redis.get(key);
    const data = JSON.parse(rawData!) as UserHeaderRequest;

    req[USER] = {
      ATPayload: payload,
      info: data.info,
      session: data.session
    } as UserHeaderRequest;
    
    return true;
  }
}