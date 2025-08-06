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
import { SuccessResponseInterceptor } from './common/interceptor/success-response.interceptor';

@Module({
  controllers: [AppController],
  providers: [
    AppService,
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
    }
  ],
  imports: [
    MeModule, UsersModule, AuthsModule,
    ConfigModule.forRoot({  
      envFilePath: '.env',
      isGlobal: true,
    }),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Here you can apply global middlewares if needed
    consumer.apply( HelmetMiddleware ).forRoutes('*');
  }
}
  