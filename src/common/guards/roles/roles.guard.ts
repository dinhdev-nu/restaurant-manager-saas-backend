import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_KEY } from 'src/common/decorator/roles.decorator';
import { Role } from 'src/common/enums/roles.enum';
import { UserHeaderRequest } from '../jwt/jwt.guard';


export const ROLE_GUARD = 'roles';

@Injectable()
export class RolesGuard implements CanActivate {

  constructor( 
    private readonly reflector: Reflector,
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
    const user = req.user as UserHeaderRequest;

    const userRoles = user.info.roles;

    const hasRole = roles.some((role) => userRoles.includes(role));

    return hasRole;
  }
}
