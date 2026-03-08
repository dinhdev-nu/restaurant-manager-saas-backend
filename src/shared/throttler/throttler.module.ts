import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AppConfigService } from "src/config/config.service";
import { ThrottlerStorageRedisService } from "./throttler-storage.service";
import { INJECTION_TOKEN } from "src/common/constants/injection-token.constant";
import Redis from "ioredis";

@Module({
    imports: [
        ThrottlerModule.forRootAsync({
            inject: [AppConfigService, INJECTION_TOKEN.REDIS_CLIENT],
            useFactory: (
                config: AppConfigService,
                redisClient: Redis,
            ) => ({
                storage: new ThrottlerStorageRedisService(redisClient),
                throttlers: [
                    {
                        name: 'global',
                        ttl: config.throttler.ttl,
                        limit: config.throttler.limit,
                        blockDuration: config.throttler.block_duration,
                    },
                    {
                        name: 'default',
                        ttl: config.throttler.default_ttl,
                        limit: config.throttler.default_limit,
                        blockDuration: config.throttler.default_block_duration,
                    }
                ]
            })
        })
    ],
    providers: [ThrottlerStorageRedisService],
    exports: [ThrottlerModule, ThrottlerStorageRedisService],
})
export class SharedThrottlerModule {}