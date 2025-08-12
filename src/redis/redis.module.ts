import { Global, Module } from '@nestjs/common';
import { RedisProvider } from './redis.provider';

@Global() // This makes the module globally available
@Module({
    providers: [RedisProvider],
    exports: [RedisProvider] // Export the provider so it can be used in other modules
})
export class RedisModule {}
