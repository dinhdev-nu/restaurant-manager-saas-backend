import { ErrorCode } from "src/common/constants/error-code.constant";
import { BaseException } from "../base/base.exception";
import { HttpStatus } from "@nestjs/common";

export class TooManyRequestException extends BaseException {
    constructor(errorCode: ErrorCode, message: string, detail?: string) {
        super(HttpStatus.TOO_MANY_REQUESTS, errorCode, message, detail);
    }
}