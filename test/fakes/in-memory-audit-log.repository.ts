import { randomUUID } from 'node:crypto';
import { AuditLog } from '../../src/modules/audit/entities/audit-log.entity.js';
import {
  AuditLogRepository,
  type NewAuditLog,
} from '../../src/modules/audit/repositories/audit-log.repository.js';

export class InMemoryAuditLogRepository extends AuditLogRepository {
  readonly entries: AuditLog[] = [];

  async append(entry: NewAuditLog): Promise<void> {
    this.entries.push(
      Object.assign(new AuditLog(), { ...entry, id: randomUUID(), createdAt: new Date() }),
    );
  }

  async findByEntity(entityType: AuditLog['entityType'], entityId: string): Promise<AuditLog[]> {
    return this.entries.filter((e) => e.entityType === entityType && e.entityId === entityId);
  }

  actions(): string[] {
    return this.entries.map((e) => e.action);
  }
}
