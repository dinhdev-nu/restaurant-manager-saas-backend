import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { catchError, Observable, throwError, timeout, TimeoutError } from "rxjs";
import { RequestTimeoutException } from "../exceptions";
import { ERROR_CODE } from "../constants/error-code.constant";
import { Reflector } from "@nestjs/core";
import { BYPASS_INTERCEPTORS_KEY } from "../decorators";


@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
    private readonly TIMEOUT_DURATION = 10000; // 10 
    
    constructor( private readonly reflector: Reflector ) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        
        const isBypass = this.reflector.getAllAndOverride<boolean>(BYPASS_INTERCEPTORS_KEY, [
            context.getHandler(),
            context.getClass()
        ]);

        if (isBypass) return next.handle();

        return next.handle().pipe(
            timeout(this.TIMEOUT_DURATION),
            catchError((error) => {
                if (error instanceof TimeoutError) {
                    return throwError(() => new RequestTimeoutException(
                        ERROR_CODE.REQUEST_TIMEOUT_ERROR,
                        `Request timed out after ${this.TIMEOUT_DURATION} ms.`
                    ))
                }
                return throwError(() => error);
            })
        )
    }
}