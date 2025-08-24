import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';
import { UnauthorizedException } from 'src/common/exceptions/http-exception';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {

    const request = context.switchToHttp().getRequest();
    const header = request.headers['authorization'] || "";

    const token = header.split(' ')[1];

    if (!token) throw new UnauthorizedException("Missing access token");

    // veryfy token
    try {
      const payload = this.jwt.verify(token);
      request.user = payload;
    } catch (error) {
      console.log(error);
      throw new UnauthorizedException("Invalid access token");
    }
    
    return true;
  }
}
