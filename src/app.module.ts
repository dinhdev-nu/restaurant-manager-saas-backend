import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ValidationPipeConfig } from './common/configs/validation.config';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { LoggerModule } from './logger/logger.module';
import { RedisModule } from './databases/redis/redis.module';
import { MongoModule } from './databases/mongo/mongo.module';
import { RestaurantModule } from './modules/restaurant/restaurant.module';
import { OrderModule } from './modules/order/order.module'
import { RolesGuard } from './common/guards/roles.guard';
import { PaymentModule } from './modules/payment/payment.module';
import { JwtGuard } from './common/guards/jwt-auth.guard' ;
import { SseModule } from './modules/sse/sse.module';
import { AppConfigModule } from './config/config.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AllExceptionFilter } from './common/filters/all-exception.filter';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { CorrelationIdMiddleware } from './common/middlewares/correlation-id.middleware';
import { LoggerMiddleware } from './common/middlewares/logger.middleware'; 
import { SharedThrottlerModule } from './shared/throttler/throttler.module';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { QueueModule } from './queue/queue.module';
import { HealthModule } from './health/health.module';

@Module({
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_PIPE, useClass: ValidationPipeConfig },
    { provide: APP_INTERCEPTOR,  useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionFilter }, // LIFO,
    { provide: APP_FILTER, useClass: HttpExceptionFilter }, // LIFO
  ],
  imports: [
    AppConfigModule,

    SharedThrottlerModule,
    QueueModule,

    HealthModule,
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
      // Apply middlewares globally
      consumer.apply(
        CorrelationIdMiddleware,
        LoggerMiddleware
      ).forRoutes('*');
  }
}
  