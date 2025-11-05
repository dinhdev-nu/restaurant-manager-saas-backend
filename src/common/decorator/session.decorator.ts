import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { UserHeaderRequest } from "../guards/jwt/jwt.guard";


export const UserSession = createParamDecorator(
    (_data, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        return request.user as UserHeaderRequest;
    }
)