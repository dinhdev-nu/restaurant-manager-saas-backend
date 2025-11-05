import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/common/constants/redis.const';
import { ROLE_KEY, Roles } from 'src/common/decorator/roles.decorator';
import { Role } from 'src/common/enums/roles.enum';
import { ForbiddenException } from 'src/common/exceptions/http-exception';
import { AuthsService } from 'src/modules/auths/auths.service';
import { UserDocument } from 'src/modules/auths/schema/user.schema';


export const ROLE_GUARD = 'roles';

@Injectable()
export class RolesGuard implements CanActivate {

  constructor( 
    private readonly reflector: Reflector,
    private readonly authService: AuthsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
      const roles = this.reflector.getAllAndOverride<Role[]>( ROLE_KEY, 
      [
        context.getHandler(),
        context.getClass()
      ]
    )
    if (!roles || roles.length === 0) {
      return true; // No roles required, allow access
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user as UserDocument;

    const hasRole = roles.some((role) => user.roles.includes(role));
    req.userInfo = user;

    return hasRole;
  }
}
