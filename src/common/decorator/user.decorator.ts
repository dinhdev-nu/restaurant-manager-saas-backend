import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { UserDocument } from "src/modules/auth/schema/user.schema";


export const User = createParamDecorator(
    ( _data, ctx: ExecutionContext ) => {
        const request = ctx.switchToHttp().getRequest();
        return request.user.info as UserDocument;
    }
)