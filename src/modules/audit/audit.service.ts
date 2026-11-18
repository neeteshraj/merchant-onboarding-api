import type { AuditLog } from './entities/audit-log.entity.js';
import type { AuditAction, AuditEntityType } from './enums/audit-action.enum.js';

export interface AuditEntry {
  /** `null` for system actions. */
  actorId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export abstract class AuditService {
  /**
   * Persists an audit entry with sensitive metadata redacted. When called
   * inside a {@link TransactionRunner} unit of work, the entry commits or rolls
   * back together with the change it describes.
   */
  abstract record(entry: AuditEntry): Promise<void>;

  /** Entries for one entity, oldest first. */
  abstract findForEntity(entityType: AuditEntityType, entityId: string): Promise<AuditLog[]>;
}
