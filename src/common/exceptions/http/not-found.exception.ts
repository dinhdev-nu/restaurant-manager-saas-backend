import { HttpStatus } from "@nestjs/common";
import { BaseException } from "../base/base.exception";
import { ERROR_CODE, ErrorCode } from "src/common/constants/error-code.constant";


export class NotFoundException extends BaseException {
    constructor(
        errorCode: ErrorCode, message: string, details?: unknown,
    ) {
        super(
            HttpStatus.NOT_FOUND,
            errorCode,
            message,
            details
        )
    }
}