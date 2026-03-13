import { Logger, Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { INJECTION_TOKEN } from 'src/common/constants/injection-token.constant';
import { AppConfigService } from 'src/config/config.service';

export const RedisProvider: Provider = {
    provide: INJECTION_TOKEN.REDIS_CLIENT,
    inject: [AppConfigService],
    useFactory: (config: AppConfigService) => {
        const redis = new Redis({
            host: config.database.redisHost,
            port: config.database.redisPort,
            password: config.database.redisPassword || undefined,
            db: config.database.redisDb,
            maxRetriesPerRequest: 5, // Disable retrying failed commands
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
