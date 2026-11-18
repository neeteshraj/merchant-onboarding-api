import { Injectable } from '@nestjs/common';
import { TypeOrmRepository } from '../../../database/typeorm.repository.js';
import { AuditLog } from '../entities/audit-log.entity.js';
import { AuditLogRepository, type NewAuditLog } from './audit-log.repository.js';

@Injectable()
export class TypeOrmAuditLogRepository
  extends TypeOrmRepository<AuditLog>
  implements AuditLogRepository
{
  protected readonly entity = AuditLog;

  async append(entry: NewAuditLog): Promise<void> {
    await this.repository.save(this.repository.create(entry));
  }

  findByEntity(entityType: AuditLog['entityType'], entityId: string): Promise<AuditLog[]> {
    return this.repository.find({
      where: { entityType, entityId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  }
}
