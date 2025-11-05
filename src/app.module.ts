import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { UsersModule } from './modules/users/users.module';
import { AuthsModule } from './modules/auths/auths.module';
import { HelmetMiddleware } from './common/middlewares/helmet.middleware/helmet.middleware.middleware';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ValidationPipeConfig } from './config/validation.config';
import { HTTP_ExceptionFilter } from './common/filters/exception.filter';
import { SuccessResponseInterceptor } from './common/interceptors/success-response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { LoggerModule } from './common/logger/logger.module';
import { RedisModule } from './databases/redis/redis.module';
import { MongoModule } from './databases/mongo/mongo.module';
import { LoadConfigModule } from './config/load-config.module';
import { RestaurantsModule } from './modules/restaurants/restaurants.module';
import { OrdersModule } from './modules/orders/orders.module'
import { RolesGuard } from './common/guards/roles/roles.guard';
import { PaymentsModule } from './modules/payments/payments.module';
import { JwtModule } from '@nestjs/jwt';
import { JwtGuard } from './common/guards/jwt/jwt.guard';

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


    UsersModule, AuthsModule,
    RestaurantsModule,

    LoggerModule,

    RedisModule,
    MongoModule,
    // OrdersModule,
    // PaymentsModule
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Here you can apply global middlewares if needed
    consumer.apply( HelmetMiddleware ).forRoutes('*');
  }
}
  