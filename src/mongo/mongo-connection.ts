import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { type Db, MongoClient } from 'mongodb';
import { AppConfigService } from '../config/app-config.service.js';

/**
 * Lazily created MongoDB client. Nothing connects unless a Mongo-backed
 * component is actually used, so deployments on the Postgres audit store
 * need no Mongo configuration at all.
 */
@Injectable()
export class MongoConnection implements OnApplicationShutdown {
  private client?: MongoClient;

  constructor(private readonly config: AppConfigService) {}

  db(): Db {
    this.client ??= new MongoClient(this.config.get('MONGO_URL'));
    return this.client.db(this.config.get('MONGO_DB_NAME'));
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client?.close();
  }
}
