import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { Response, Request } from "express";
import { BaseException } from "../exceptions";
import { ERROR_CODE, ErrorCode } from "../constants/error-code.constant";
import { CORRELATION_ID_HEADER } from "../middlewares/correlation-id.middleware";
import { LoggerService } from "../../logger/logger.service";
import { ApiErrorRessponse } from "../interfaces/api-response.interface";



@Catch(HttpException) // Bắt tất cả các lỗi HttpException
export class HttpExceptionFilter implements ExceptionFilter {

    constructor(private readonly loggerService: LoggerService) {}

    catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse<Response>();
        const req = ctx.getRequest<Request>();

        const status = exception.getStatus();
        const correlationId = req[CORRELATION_ID_HEADER] || 'N/A';
       

        if (exception instanceof BaseException) {
            const errResponse: ApiErrorRessponse = {
                success: false,
                errorCode: exception.errorCode,
                message: exception.message,
                details: exception.details || null,
                path: req.url,
                correlationId,
                timestamp: new Date().toISOString()
            };
            const logMsg = `[${correlationId}] <- ${req.method} ${req.url} | ${status} | ${exception.errorCode} | ${exception.message}`;
            this.loggerService.writeLog(logMsg);
            return res.status(status).json(errResponse);
        }

        // Handle Exception for pipe
        const response = exception.getResponse() as any
        if (
            status === HttpStatus.BAD_REQUEST 
            && Array.isArray(response.message)
        ) {
            const errorResponse: ApiErrorRessponse = {
                success: false,
                errorCode: ERROR_CODE.VALIDATION_ERROR,
                message: 'Validation failed',
                details: response.message,
                path: req.url,
                correlationId,
                timestamp: new Date().toISOString()
            };
            const logMsg = `[${correlationId}] <- ${req.method} ${req.url} | ${status} | ${errorResponse.errorCode} | ${exception.message}`;
            this.loggerService.writeLog(logMsg);
            return res.status(status).json(errorResponse);
        }

        // Handle Not Found Exception
       if (status === HttpStatus.NOT_FOUND) {
            const errorResponse: ApiErrorRessponse = {
                success: false,
                errorCode: ERROR_CODE.RESOURCE_NOT_FOUND,
                message: `${req.url} not found`,
                details: response.message || null,
                path: req.url,
                correlationId,
                timestamp: new Date().toISOString()
            };
            const logMsg = `[${correlationId}] <- ${req.method} ${req.url} | ${status} | ${errorResponse.errorCode} | ${exception.message}`;
            this.loggerService.writeLog(logMsg);
            return res.status(status).json(errorResponse);
        }


        // Handle other HttpException
        const errResponse: ApiErrorRessponse = {
            success: false,
            errorCode: status >= HttpStatus.INTERNAL_SERVER_ERROR ? ERROR_CODE.INTERNAL_ERROR : ERROR_CODE.COMMON_ERROR,
            message: typeof response === 'string' ? response : (response.message || 'An error occurred'),
            details: null,
            path: req.url,
            correlationId,
            timestamp: new Date().toISOString()
        };
        const logMsg = `[${correlationId}] <- ${req.method} ${req.url} | ${status} | ${errResponse.errorCode} | ${exception.message}`;
        this.loggerService.writeLog(logMsg);
        return res.status(status).json(errResponse);
    }

}