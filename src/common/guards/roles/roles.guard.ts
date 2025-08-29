import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_KEY, Roles } from 'src/common/decorator/roles.decorator';
import { Role } from 'src/common/enums/roles.enum';
import { ForbiddenException } from 'src/common/exceptions/http-exception';
import { AuthsService } from 'src/modules/auths/auths.service';


export const ROLE_GUARD = 'roles';

@Injectable()
export class RolesGuard implements CanActivate {

  constructor( 
    private readonly reflector: Reflector,
    private readonly authService: AuthsService
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    const roles = this.reflector.getAllAndOverride<Role[]>( ROLE_KEY, 
      [
        context.getHandler(),
        context.getClass()
      ]
    )

    if ( !roles ) return true;
    if ( !user ) throw new ForbiddenException('Unauthorized');

    const userData =  await this.authService.getUserById(user.userId);
    if (!userData) throw new ForbiddenException('Unauthorized');

    if (!userData.roles || userData.roles !== user.roles) {
      throw new ForbiddenException('Roles have been changed. Please login again');
    }

    const hasRole = roles.some((role) => userData.roles?.includes(role)); 
    req.user = userData;

    return hasRole;
  }
}
