import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { CORRELATION_ID_HEADER } from "./correlation-id.middleware";
import { LoggerService } from "../../logger/logger.service";

@Injectable()
export class LoggerMiddleware implements NestMiddleware {

    constructor(private readonly loggerService: LoggerService) {}

    use(req: Request, res: Response, next: NextFunction) {
        
        // Log request 
        const { method, originalUrl, ip } = req;
        const userAgent = req.get('user-agent') || "";
        const corrilationId = req[CORRELATION_ID_HEADER] || "N/A";
        const startTime = Date.now();

        const logMsg = `[${corrilationId}] -> ${method} ${originalUrl} | IP: ${ip} | User-Agent: ${userAgent}`;
        this.loggerService.writeLog(logMsg);

        // Log response
        res.on('finish', () => {
            const duration = Date.now() - startTime;
            const { statusCode } = res;
            const logMsg = `[${corrilationId}] <- ${method} ${originalUrl} | ${statusCode} | ${duration}ms`;

            // Check err status 
            this.loggerService.writeLog(logMsg)
        })

        next();
    }
}