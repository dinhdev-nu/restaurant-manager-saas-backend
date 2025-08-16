import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MeModule } from './modules/me/me.module';
import { UsersModule } from './modules/users/users.module';
import { AuthsModule } from './modules/auths/auths.module';
import { HelmetMiddleware } from './common/middlewares/helmet.middleware/helmet.middleware.middleware';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ValidationPipeConfig } from './config/validation.config';
import { HTTP_ExceptionFilter } from './common/filters/exception.filter';
import { SuccessResponseInterceptor } from './common/interceptors/success-response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { LoggerModule } from './common/logger/logger.module';
import { RedisModule } from './redis/redis.module';
import { MongoModule } from './databases/mongo/mongo.module';
import { LoadConfigModule } from './config/load-config.module';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [AppController],
  providers: [AppService,
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


    // MeModule, UsersModule, AuthsModule,

    LoggerModule,

    RedisModule,
    MongoModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Here you can apply global middlewares if needed
    consumer.apply( HelmetMiddleware ).forRoutes('*');
  }
}
  