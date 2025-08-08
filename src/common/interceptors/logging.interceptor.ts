import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { catchError, Observable, tap, throwError } from 'rxjs';
import { LoggerService } from '../logger/logger.service';
import e from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {

  constructor(private readonly loggerService: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;
    const now = Date.now();
    console.log(`[${new Date().toISOString()}] ${method} ${url}`);


    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap(data => {
        const responseTime = Date.now() - now;
        const statusCode = response.statusCode;
        const logLevel = process.env.LOG_LEVEL || 'info';

        let message = `[${new Date().toISOString()}] [${logLevel.toUpperCase()}] [${method}] ${statusCode} ${url} - ${responseTime}ms`;

        console.log(message);
        this.loggerService.writeLog(message);
      }),

      catchError((error) => {
        const responseTime = Date.now() - now;
        const statusCode = error.status;

        let message = `[${new Date().toISOString()}] [ERROR] [${method}] ${statusCode} ${url} - ${responseTime}ms`;
        console.error(message);
        if (error.response && error.response.message) {
          message += `\n ::::::: ERROR: ${JSON.stringify(error.response.message)}`;
        }
        message += `\n ::::::: Stack: ${error.stack || 'No stack'}`;
        this.loggerService.writeLog(message);

        throw error;
      })

    );
  }
}
