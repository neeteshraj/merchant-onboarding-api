import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Collection } from 'mongodb';
import { MongoConnection } from '../../../mongo/mongo-connection.js';
import { AuditLog } from '../entities/audit-log.entity.js';
import { AuditLogRepository, type NewAuditLog } from './audit-log.repository.js';

export const AUDIT_LOG_COLLECTION = 'audit_logs';

interface AuditLogDocument extends NewAuditLog {
  _id: string;
  createdAt: Date;
}

/**
 * Audit store on MongoDB, selected with `AUDIT_STORE=mongo`.
 *
 * Writes are not part of the Postgres transaction: an entry for a change that
 * later rolls back can survive. The ADR on audit storage covers this trade-off.
 */
@Injectable()
export class MongoAuditLogRepository extends AuditLogRepository {
  private indexReady?: Promise<string>;

  constructor(private readonly mongo: MongoConnection) {
    super();
  }

  async append(entry: NewAuditLog): Promise<void> {
    const collection = await this.collection();
    await collection.insertOne({ ...entry, _id: randomUUID(), createdAt: new Date() });
  }

  async findByEntity(entityType: AuditLog['entityType'], entityId: string): Promise<AuditLog[]> {
    const collection = await this.collection();
    const documents = await collection
      .find({ entityType, entityId })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
    return documents.map(({ _id, ...fields }) =>
      Object.assign(new AuditLog(), { ...fields, id: _id }),
    );
  }

  private async collection(): Promise<Collection<AuditLogDocument>> {
    const collection = this.mongo.db().collection<AuditLogDocument>(AUDIT_LOG_COLLECTION);
    this.indexReady ??= collection.createIndex(
      { entityType: 1, entityId: 1, createdAt: 1 },
      { name: 'idx_audit_logs_entity' },
    );
    await this.indexReady;
    return collection;
  }
}
