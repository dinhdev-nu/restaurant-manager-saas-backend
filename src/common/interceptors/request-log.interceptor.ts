import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;
    const now = Date.now();


    return next.handle().pipe(
      tap(data => {
        const responseTime = Date.now() - now;
        console.log(`[${new Date().toISOString()}] ${method} ${url} - ${responseTime}ms`);
      })
    );
  }
}
