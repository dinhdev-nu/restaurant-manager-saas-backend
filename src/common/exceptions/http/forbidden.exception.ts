import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "src/common/constants/error-code.constant";
import { BaseException } from "../base/base.exception";

export class ForbiddenException extends BaseException {
    constructor(
        errorCode: ErrorCode,
        message: string,
        details?: unknown
    ) {
        super(HttpStatus.FORBIDDEN, errorCode, message, details);
    }
}