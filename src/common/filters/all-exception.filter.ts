import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import { Response } from "express";
import { ERROR_CODE } from "../constants/error-code.constant";
import { LoggerService } from "../../logger/logger.service";
import { CORRELATION_ID_HEADER } from "../middlewares/correlation-id.middleware";
import { ApiErrorRessponse } from "../interfaces/api-response.interface";


@Catch() // Bắt tất cả các lỗi
export class AllExceptionFilter implements ExceptionFilter {
    constructor(private readonly loggerService: LoggerService) {}

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
        const logMsg = `[${correlationId}] <- ${req.method} ${req.url} | ${status} | ${response.errorCode} | ${exception.stack}`;
        this.loggerService.writeLog(logMsg);

        return res.status(status).json(response);
    }

}