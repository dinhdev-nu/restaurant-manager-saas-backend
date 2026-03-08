import { registerAs } from "@nestjs/config";

export interface IThrottlerConfig {
    ttl: number;
    limit: number;
    block_duration: number;
    default_ttl: number;
    default_limit: number;
    default_block_duration: number;
}

export default registerAs('throttler', () => ({
    ttl: Number(process.env.THROTTLE_TTL),
    limit: Number(process.env.THROTTLE_LIMIT),
    block_duration: Number(process.env.THROTTLE_BLOCK_DURATION),
    default_ttl: Number(process.env.THROTTLE_DEFAULT_TTL), // 1 minute
    default_limit: Number(process.env.THROTTLE_DEFAULT_LIMIT),
    default_block_duration: Number(process.env.THROTTLE_DEFAULT_BLOCK_DURATION),
}))