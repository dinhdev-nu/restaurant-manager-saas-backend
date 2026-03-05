import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common";
import { Types } from "mongoose";
import { BadRequestException } from "../exceptions";
import { ERROR_CODE } from "../constants/error-code.constant";

@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, Types.ObjectId> {
    transform(value: string, metadata: ArgumentMetadata) {
        if (!Types.ObjectId.isValid(value)) {
            throw new BadRequestException(ERROR_CODE.INVALID_ID_ERROR, `${metadata.data} must be a valid ObjectId`);
        }
        return new Types.ObjectId(value);
    }
}
