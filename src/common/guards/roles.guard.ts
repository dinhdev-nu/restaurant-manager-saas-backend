import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../constants/role.constant';
import { ROLES_KEY } from '../decorators';
import { UserHeaderRequest } from './jwt-auth.guard';
import { ForbiddenException } from '../exceptions';
import { ERROR_CODE } from '../constants/error-code.constant';


export const ROLE_GUARD = 'roles';

@Injectable()
export class RolesGuard implements CanActivate {

  constructor( private readonly reflector: Reflector ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
      const requiredRoles = this.reflector.getAllAndOverride<Role[]>( ROLES_KEY, 
      [
        context.getHandler(), 
        context.getClass()
      ]
    )
    if (!requiredRoles || requiredRoles.length === 0) 
      return true; // No roles required, allow access

    const req = context.switchToHttp().getRequest();
    const user = req.user as UserHeaderRequest;

    const userRole = user.info.role;

    const hasRole = requiredRoles.includes(userRole);

    if (!hasRole) {
      throw new ForbiddenException(
        ERROR_CODE.FORBIDDEN, 
        "You do not have permission to access this resource"
      ); 
    }

    return true;
  }
}
