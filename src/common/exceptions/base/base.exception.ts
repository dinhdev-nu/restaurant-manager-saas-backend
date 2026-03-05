import { HttpException, HttpStatus } from "@nestjs/common";
import { ErrorCode } from "src/common/constants/error-code.constant";

export abstract class BaseException extends HttpException {
    readonly errorCode: ErrorCode;
    readonly details?: unknown;

    constructor(
        status: HttpStatus,
        errorCode: ErrorCode,
        message: string,
        details?: unknown
    ) {
        super(message, status);
        this.errorCode = errorCode;
        this.details = details;
    }
}