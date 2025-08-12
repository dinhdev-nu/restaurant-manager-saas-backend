import { Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/common/constants/redis.const';

export const RedisProvider: Provider = {
    provide: REDIS_CLIENT,
    useFactory: async () => {
        const redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: Number(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            db: Number(process.env.REDIS_DATABASE) || 0
        })
        
        // LOG
        redis.on("connect", () => {
            console.log("Connected to Redis Successfully !");
        })

        redis.on("error", (err) => {
            console.error("Redis error:", err);
        })

        redis.on("close", () => {
            console.log("Connection to Redis closed");
        })

        return redis;

    }

}
