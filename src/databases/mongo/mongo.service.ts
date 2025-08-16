// mongo.service.ts
import { Injectable, Logger, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class MongoLifecycleService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('MongoDB');

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onModuleInit() {
    this.connection.on('disconnected', () => {
      this.logger.warn('MongoDB disconnected');
    });

    this.connection.on('close', () => {
      this.logger.warn('MongoDB connection closed');
    });
  }

  async onApplicationShutdown(signal?: string) {
    this.logger.warn(`App is shutting down due to signal: ${signal}`);
    await this.connection.close();
    this.logger.log('✅ MongoDB connection closed gracefully');
  }
}
