import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { RiskModule } from '../risk/risk.module.js';
import { UsersModule } from '../users/users.module.js';
import { ApplicationPersistenceModule } from './application-persistence.module.js';
import { ApplicationsController } from './applications.controller.js';
import { ApplicationsService } from './applications.service.js';
import { ApplicationsServiceImpl } from './applications.service.impl.js';
import { ApplicationAccessPolicy } from './domain/application-access.policy.js';
import { RoleBasedApplicationAccessPolicy } from './domain/role-based-application-access.policy.js';

@Module({
  imports: [ApplicationPersistenceModule, UsersModule, AuditModule, RiskModule],
  controllers: [ApplicationsController],
  providers: [
    { provide: ApplicationsService, useClass: ApplicationsServiceImpl },
    { provide: ApplicationAccessPolicy, useClass: RoleBasedApplicationAccessPolicy },
  ],
})
export class ApplicationsModule {}
