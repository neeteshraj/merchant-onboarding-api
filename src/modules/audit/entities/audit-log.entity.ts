import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { AuditAction, AuditEntityType } from '../enums/audit-action.enum.js';

/**
 * Append-only record of significant actions. Deliberately has no foreign keys
 * so history survives deletion of the referenced rows.
 */
@Entity({ name: 'audit_logs' })
@Index('idx_audit_logs_entity', ['entityType', 'entityId', 'createdAt'])
export class AuditLog extends BaseEntity {
  /** `null` when the action was performed by the system (e.g. the risk worker). */
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', length: 64 })
  action: AuditAction;

  @Column({ name: 'entity_type', type: 'varchar', length: 64 })
  entityType: AuditEntityType;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  /** Already redacted by {@link AuditService} before persistence. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;
}
