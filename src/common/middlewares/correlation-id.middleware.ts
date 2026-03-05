import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export const CORRELATION_ID_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction) {
        
        // Check ID client 
        const correlationId = (req.headers[CORRELATION_ID_HEADER]) || randomUUID();

        // Set header
        res.setHeader(CORRELATION_ID_HEADER, correlationId);

        // Set request
        req[CORRELATION_ID_HEADER] = correlationId;

        next();
    }
}