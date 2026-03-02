import { registerAs } from "@nestjs/config";

export interface IJwtConfig {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
}

export default registerAs('jwt', () => ({
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessTtl: process.env.JWT_ACCESS_TTL,
    refreshTtl: process.env.JWT_REFRESH_TTL,
}))