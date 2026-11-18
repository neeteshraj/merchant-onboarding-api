import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppConfigService } from './config/app-config.service.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { ApplicationsModule } from './modules/applications/applications.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';
import { RedisConnection } from './redis/redis-connection.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    BullModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisConnection, AppConfigService],
      useFactory: (redis: RedisConnection, config: AppConfigService) => ({
        connection: redis.client,
        prefix: config.get('QUEUE_PREFIX'),
      }),
    }),
    AuthModule,
    ApplicationsModule,
    WebhooksModule,
  ],
})
export class AppModule {}
