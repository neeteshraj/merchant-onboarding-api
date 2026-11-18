import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuditStore } from '../../config/env.validation.js';
import { MongoModule } from '../../mongo/mongo.module.js';
import { AuditService } from './audit.service.js';
import { AuditServiceImpl } from './audit.service.impl.js';
import { AuditLogRepository } from './repositories/audit-log.repository.js';
import { MongoAuditLogRepository } from './repositories/mongo-audit-log.repository.js';
import { TypeOrmAuditLogRepository } from './repositories/typeorm-audit-log.repository.js';

@Module({
  imports: [MongoModule],
  providers: [
    { provide: AuditService, useClass: AuditServiceImpl },
    TypeOrmAuditLogRepository,
    MongoAuditLogRepository,
    {
      provide: AuditLogRepository,
      inject: [AppConfigService, TypeOrmAuditLogRepository, MongoAuditLogRepository],
      useFactory: (
        config: AppConfigService,
        postgres: TypeOrmAuditLogRepository,
        mongo: MongoAuditLogRepository,
      ): AuditLogRepository => (config.get('AUDIT_STORE') === AuditStore.Mongo ? mongo : postgres),
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
