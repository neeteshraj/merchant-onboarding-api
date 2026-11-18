import { Module } from '@nestjs/common';
import { RedisConnection } from './redis-connection.js';

@Module({
  providers: [RedisConnection],
  exports: [RedisConnection],
})
export class RedisModule {}
