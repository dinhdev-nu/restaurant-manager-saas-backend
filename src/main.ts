import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import * as compression from 'compression';
import helmet from 'helmet';
import { AppConfigService } from './config/config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(AppConfigService)

  app.use(compression()) // Gzip compression
  app.use(cookieParser()) // Read cookies
  app.use(helmet()) // Secure HTTP headers
  
  app.enableCors(config.corsOptions) // CORS

  await app.listen(config.app.port);
  console.log(`Application is running on: ${await app.getUrl()}`);
}

bootstrap();
