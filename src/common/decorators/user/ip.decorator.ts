import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const UserIP = createParamDecorator(
    (data: null, ctx: ExecutionContext) => {
        const req = ctx.switchToHttp().getRequest();
        return req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    }
)