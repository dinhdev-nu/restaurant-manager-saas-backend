import { HttpStatus } from "@nestjs/common";
import { BaseException } from "../base/base.exception";
import { Types } from "mongoose";
import { ERROR_CODE } from "src/common/constants/error-code.constant";


export class NotFoundException extends BaseException {
    constructor(
        resource: string, identifier: Types.ObjectId | string | number
    ) {
        super(
            HttpStatus.NOT_FOUND,
            identifier ? ERROR_CODE.USER_NOT_FOUND : ERROR_CODE.RESOURCE_NOT_FOUND,
            identifier ? `${resource} with id ${identifier.toString()} not found` : `${resource} not found`,
        )
    }
}