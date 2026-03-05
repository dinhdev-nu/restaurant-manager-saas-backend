import { SetMetadata } from "@nestjs/common";

export const BYPASS_INTERCEPTORS_KEY = 'bypass_interceptors';

export const BypassInterceptors = () => SetMetadata(BYPASS_INTERCEPTORS_KEY, true);