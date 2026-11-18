import { Module } from '@nestjs/common';
import { MongoConnection } from './mongo-connection.js';

@Module({
  providers: [MongoConnection],
  exports: [MongoConnection],
})
export class MongoModule {}
