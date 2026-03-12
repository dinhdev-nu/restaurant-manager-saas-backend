import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";

export const COOKIEPARAM = {
    REFRESH_TOKEN: "refresh_token",
} as const;

type CookieParam = keyof typeof COOKIEPARAM;

export const Cookie = createParamDecorator(
    (data: CookieParam, context: ExecutionContext): string => {
        const ctx = context.switchToHttp()
        const req = ctx.getRequest<Request>();
        const cookies = req.cookies;
        return cookies[COOKIEPARAM[data]];
    }
)