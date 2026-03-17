import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import * as compression from 'compression';
import helmet from 'helmet';
import { AppConfigService } from './config/config.service';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const config = app.get(AppConfigService)

  // app.set('trust proxy', 1) 
  app.use(compression()) // Gzip compression
  app.use(cookieParser()) // Read cookies
  app.use(helmet()) // Secure HTTP headers
  
  app.enableCors(config.corsOptions) // CORS

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Multi Restaurant Manager API')
    .setDescription('API documentation for Multi Restaurant Manager')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('refresh_token', { type: 'apiKey', in: 'cookie', name: 'refresh_token' })
    .addTag('auth', 'Authentication related endpoints')
    .addTag('users', 'User management endpoints')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, documentFactory(), {
    jsonDocumentUrl: '/api-docs-json', 
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(config.app.port);
  console.log(`Application is running on: ${await app.getUrl()}`);
}

bootstrap();
