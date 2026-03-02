import { Global, Logger, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { AppConfigService } from 'src/config/config.service';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: async (config: AppConfigService) => ({
        uri: config.database.mongodbUri,
        connectionFactory: (connection: Connection) => {

          const logger = new Logger('MongoDB');

          connection.on('connected', () => logger.log('MongoDB connected'));
          connection.on('open', () => logger.log('MongoDB connection opened'));
          connection.on('error', (err) => logger.error('MongoDB connection error:', err));
          connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
          connection.on('reconnected', () => logger.log('MongoDB reconnected'));
          connection.on('disconnecting', () => logger.warn('MongoDB disconnecting'));

        return connection;
      },
      }),
    }), 
    ],
    // providers: [MongoLifecycleService],
    exports: [MongooseModule],
  })
export class MongoModule {}

