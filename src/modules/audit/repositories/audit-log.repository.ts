import type { AuditLog } from '../entities/audit-log.entity.js';

export type NewAuditLog = Pick<
  AuditLog,
  'actorId' | 'action' | 'entityType' | 'entityId' | 'metadata'
>;

/** Append-only store: entries can be added and read, never changed or removed. */
export abstract class AuditLogRepository {
  abstract append(entry: NewAuditLog): Promise<void>;

  /** Entries for one entity, oldest first. */
  abstract findByEntity(entityType: AuditLog['entityType'], entityId: string): Promise<AuditLog[]>;
}
