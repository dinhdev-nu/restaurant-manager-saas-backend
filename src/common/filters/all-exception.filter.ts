import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import { Response, Request } from "express";
import { ERROR_CODE } from "../constants/error-code.constant";
import { AppLoggerService } from "../../logger/logger.service";
import { CORRELATION_ID_HEADER } from "../middlewares/correlation-id.middleware";
import { ApiErrorRessponse } from "../interfaces/api-response.interface";


@Catch() // Bắt tất cả các lỗi
export class AllExceptionFilter implements ExceptionFilter {
    constructor(private readonly loggerService: AppLoggerService) {}

    catch(exception: Error, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse<Response>();
        const req = ctx.getRequest<Request>();

        const correlationId = req[CORRELATION_ID_HEADER] || 'N/A';
        const status = HttpStatus.INTERNAL_SERVER_ERROR;

        const response: ApiErrorRessponse = {
            success: false,
            errorCode: ERROR_CODE.INTERNAL_ERROR,
            message: 'Internal server error',
            details: null,
            path: req.url,
            correlationId,
            timestamp: new Date().toISOString()
        }
        this.loggerService.error(
                exception.message || response.message,
                { correlationId, method: req.method, url: req.url, status, code: response.errorCode, stack: exception.stack }
            );
        return res.status(status).json(response);
    }

}