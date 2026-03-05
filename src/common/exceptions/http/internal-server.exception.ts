import { ErrorCode } from "src/common/constants/error-code.constant";
import { BaseException } from "../base/base.exception";
import { HttpStatus } from "@nestjs/common";

export class InternalServerException extends BaseException {
    constructor(errorCode: ErrorCode, message: string, details?: unknown) {
        super(HttpStatus.INTERNAL_SERVER_ERROR, errorCode, message, details);
    }
}