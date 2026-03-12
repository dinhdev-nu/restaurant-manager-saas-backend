import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AppLoggerService } from '../../logger/logger.service';
import { Request } from 'express';
import { CORRELATION_ID_HEADER } from '../middlewares/correlation-id.middleware';
import { USER } from '../guards/jwt-auth.guard';
import { AccessTokenPayload } from 'src/modules/auth/auth.service.xxx';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {

  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    
    const correlationId = req[CORRELATION_ID_HEADER] || 'N/A';
    const handler = `${context.getClass().name}.${context.getHandler().name}`;

    return next.handle().pipe(
      tap(() => {
        const user = req[USER] as AccessTokenPayload;
        const userId = user ? user.sub : 'N/A';

        this.logger.log('Handler executed', { correlationId, userId, handler });
      }),
    );
  }
}
