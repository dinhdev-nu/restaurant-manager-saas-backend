import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ValidationPipeConfig } from './config/validation.config';
import { HTTP_ExceptionFilter } from './common/filters/exception.filter';
import { SuccessResponseInterceptor } from './common/interceptors/success-response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { LoggerModule } from './common/logger/logger.module';
import { RedisModule } from './databases/redis/redis.module';
import { MongoModule } from './databases/mongo/mongo.module';
import { LoadConfigModule } from './config/load-config.module';
import { RestaurantModule } from './modules/restaurant/restaurant.module';
import { OrderModule } from './modules/order/order.module'
import { RolesGuard } from './common/guards/roles/roles.guard';
import { PaymentModule } from './modules/payment/payment.module';
import { JwtGuard } from './common/guards/jwt/jwt.guard';
import { SseModule } from './modules/sse/sse.module';

@Module({
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_PIPE,
      useClass: ValidationPipeConfig,
    },
    {
      provide: APP_FILTER,
      useClass: HTTP_ExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SuccessResponseInterceptor
    },
    {
      provide: APP_INTERCEPTOR, 
      useClass: LoggingInterceptor
    }
  ],
  imports: [
    LoadConfigModule,

    SseModule,
    AuthModule,
    RestaurantModule,
    OrderModule,
    PaymentModule,

    LoggerModule,

    RedisModule,
    MongoModule,
  ],
})
export class AppModule {}
  