import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import * as compression from 'compression';
import helmet from 'helmet';
import { AppConfigService } from './config/config.service';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const config = app.get(AppConfigService)

  // app.set('trust proxy', 1) 
  app.use(compression()) // Gzip compression
  app.use(cookieParser()) // Read cookies
  app.use(helmet()) // Secure HTTP headers
  
  app.enableCors(config.corsOptions) // CORS

  await app.listen(config.app.port);
  console.log(`Application is running on: ${await app.getUrl()}`);
}

bootstrap();
