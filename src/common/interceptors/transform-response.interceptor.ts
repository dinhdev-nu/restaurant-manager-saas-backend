import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request, Response } from "express";
import { map, Observable } from "rxjs";
import { BYPASS_INTERCEPTORS_KEY } from "../decorators";
import { CORRELATION_ID_HEADER } from "../middlewares/correlation-id.middleware";
import { ApiSuccessResponse } from "../interfaces/api-response.interface";

export interface SuccessResponse<T> {
    data: T;
    message?: string;
}

@Injectable()
export class TransformResponseInterceptor<T> 
implements NestInterceptor<T, ApiSuccessResponse<T>> {

    constructor(private readonly reflector : Reflector) {}

    intercept(context: ExecutionContext, next: CallHandler): 
    Observable<ApiSuccessResponse<T>> {
        const ctx = context.switchToHttp()
        const res = ctx.getResponse<Response>();
        const req = ctx.getRequest<Request>();

        const isBypass = this.reflector.getAllAndOverride<boolean>(BYPASS_INTERCEPTORS_KEY, [
            context.getHandler(),
            context.getClass()
        ]);

        const correlationId = req[CORRELATION_ID_HEADER] || 'N/A';

        // SSE ,...
        if ( isBypass ) return next.handle()

        return next.handle().pipe(
            map((data) => {
                return {
                    success: true,
                    statusCode: res.statusCode,
                    message: data?.message || "Request was successful",
                    data: data?.message ? data?.data  ?? data : data,
                    correlationId,
                    timestamp: new Date().toISOString()
                }
            })
        )
    }   
}