import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";
import { USER } from "src/common/guards/jwt-auth.guard";
import { UserHeaderRequest } from "src/modules/auth/auth.types";

export const UserParamMapping = {
    INFO: (user: UserHeaderRequest) => user.info,
    PAYLOAD: (user: UserHeaderRequest) => user.ATPayload,
    SESSION: (user: UserHeaderRequest) => user.session,
    ID: (user: UserHeaderRequest) => user.info._id,
} as const;

type UserParamKey = keyof typeof UserParamMapping;

export const CurrentUser = createParamDecorator(
    (data: UserParamKey | undefined, ctx: ExecutionContext) => {
        const req = ctx.switchToHttp().getRequest<Request>();
        const user = req[USER] as UserHeaderRequest;

        if (!user) return null;

        if (!data) return user;

        const getter = UserParamMapping[data];
        return getter ? getter(user) : null;
    }
)