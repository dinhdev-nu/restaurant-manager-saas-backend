import { SetMetadata } from "@nestjs/common";

export const PROTECTED_KEY = 'isProtected';
export const Protected = (isProtected?: boolean) => SetMetadata(PROTECTED_KEY, isProtected ?? true);