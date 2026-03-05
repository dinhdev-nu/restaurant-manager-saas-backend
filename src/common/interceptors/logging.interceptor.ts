import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { catchError, Observable, tap, throwError } from 'rxjs';
import { LoggerService } from '../../logger/logger.service';
import { Request, Response } from 'express';
import { CORRELATION_ID_HEADER } from '../middlewares/correlation-id.middleware';
import { USER, UserHeaderRequest } from '../guards/jwt-auth.guard';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {

  constructor(private readonly loggerService: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const { method, url } = req;
    const startTime = Date.now();
    const correlationId = req[CORRELATION_ID_HEADER] || 'N/A';

    // Middleware handled logging request

    return next.handle().pipe(
      tap(() => {
        const { statusCode } = res
        const user = req[USER] as UserHeaderRequest;
        const userId = user ? user.info._id : "N/A";
        const duration = Date.now() - startTime;

        const logMsg = `[${correlationId}] <- User: ${userId}  | ${method} ${url} | ${statusCode} | ${duration}ms`;
        this.loggerService.writeLog(logMsg);
      }),
      catchError(err => {
        return throwError(() => err)
      })
    )
  }
}
