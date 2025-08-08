import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { ResponseDTO } from '../interfaces/response.interface';

@Injectable()
export class SuccessResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        const response: ResponseDTO = {
          status: "success",
          code: 200,
          message: "Request was successful",
          metadata: data
        }
        return response;
      })
    );
  }
}
