import { Injectable } from '@nestjs/common';
import { redact } from '../../common/security/redact.js';
import { type AuditEntry, AuditService } from './audit.service.js';
import type { AuditLog } from './entities/audit-log.entity.js';
import type { AuditEntityType } from './enums/audit-action.enum.js';
import { AuditLogRepository } from './repositories/audit-log.repository.js';

@Injectable()
export class AuditServiceImpl extends AuditService {
  constructor(private readonly logs: AuditLogRepository) {
    super();
  }

  record(entry: AuditEntry): Promise<void> {
    return this.logs.append({ ...entry, metadata: redact(entry.metadata ?? {}) });
  }

  findForEntity(entityType: AuditEntityType, entityId: string): Promise<AuditLog[]> {
    return this.logs.findByEntity(entityType, entityId);
  }
}
