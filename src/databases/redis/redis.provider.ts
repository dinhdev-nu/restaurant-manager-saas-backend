import { Logger, Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/common/constants/redis.const';

export const RedisProvider: Provider = {
    provide: REDIS_CLIENT,
    useFactory: () => {
        const redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: Number(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            db: Number(process.env.REDIS_DATABASE) || 0
        })

        const logger = new Logger('Redis');

        // LOG
        redis.on("connect", () => {
            logger.log("Connected to Redis Successfully !");
        })

        redis.on("error", (err) => {
            logger.error("Redis error:", err);
        })

        redis.on("close", () => {
            logger.log("Connection to Redis closed");
        })

        return redis;

    }

}
