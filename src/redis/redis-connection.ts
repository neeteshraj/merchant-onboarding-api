import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigService } from '../config/app-config.service.js';

/**
 * Owns the single Redis client shared by BullMQ queues and workers. BullMQ
 * duplicates it for blocking worker connections and closes those itself;
 * this class closes the original once the application shuts down.
 */
@Injectable()
export class RedisConnection implements OnApplicationShutdown {
  readonly client: Redis;

  constructor(config: AppConfigService) {
    this.client = new Redis({
      host: config.get('REDIS_HOST'),
      port: config.get('REDIS_PORT'),
      maxRetriesPerRequest: null,
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.quit();
  }
}
