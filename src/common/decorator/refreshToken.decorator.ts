import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const RefreshToken = createParamDecorator(
    (_data, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        return request.cookies['RT'] || "" as string;
    }
)