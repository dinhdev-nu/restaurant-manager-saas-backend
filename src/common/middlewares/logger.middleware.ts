import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { CORRELATION_ID_HEADER } from "./correlation-id.middleware";
import { AppLoggerService } from "../../logger/logger.service";

@Injectable()
export class LoggerMiddleware implements NestMiddleware {

    constructor(private readonly logger: AppLoggerService) {}

    use(req: Request, res: Response, next: NextFunction) {
        
        // Log request 
        const { method, originalUrl, ip } = req;
        const userAgent = req.get('user-agent') || "";
        const correlationId = req[CORRELATION_ID_HEADER] || "N/A";
        const startTime = Date.now();

        this.logger.log("Log request", { correlationId, method, url: originalUrl, ip, userAgent });

        // Log response (access log — always info level, error details handled by filters)
        res.on('finish', () => {
            const duration = Date.now() - startTime;
            const { statusCode } = res;

            this.logger.log(
                "Log response",
                { correlationId, method, url: originalUrl, statusCode, duration: duration + "ms" }
            );
        });

        next();
    }
}