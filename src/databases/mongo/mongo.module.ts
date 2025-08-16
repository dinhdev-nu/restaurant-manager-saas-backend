import { Global, Logger, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MONGO_DB_NAME, MONGO_URI } from 'src/common/constants/mongo.consts';
import { MongoLifecycleService } from './mongo.service';
import { Connection } from 'mongoose';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: async () => ({
        uri: process.env.MONGO_URI || MONGO_URI,
        dbName: process.env.MONGO_DB_NAME || MONGO_DB_NAME,
         onConnectionCreate: (connection: Connection) => {

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

