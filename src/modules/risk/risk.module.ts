import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ApplicationPersistenceModule } from '../applications/application-persistence.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { KybProvider } from './providers/kyb-provider.js';
import { SimulatedKybProvider } from './providers/simulated-kyb.provider.js';
import { BullMqRiskReviewQueue } from './queue/bullmq-risk-review.queue.js';
import { RISK_REVIEW_QUEUE } from './queue/risk-review-queue.constants.js';
import { RiskReviewProcessor } from './queue/risk-review.processor.js';
import { RiskReviewQueue } from './queue/risk-review.queue.js';
import { RiskAssessmentRepository } from './repositories/risk-assessment.repository.js';
import { TypeOrmRiskAssessmentRepository } from './repositories/typeorm-risk-assessment.repository.js';
import { RiskReviewService } from './risk-review.service.js';
import { RiskReviewServiceImpl } from './risk-review.service.impl.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: RISK_REVIEW_QUEUE }),
    ApplicationPersistenceModule,
    AuditModule,
  ],
  providers: [
    { provide: KybProvider, useClass: SimulatedKybProvider },
    { provide: RiskReviewQueue, useClass: BullMqRiskReviewQueue },
    { provide: RiskAssessmentRepository, useClass: TypeOrmRiskAssessmentRepository },
    { provide: RiskReviewService, useClass: RiskReviewServiceImpl },
    RiskReviewProcessor,
  ],
  exports: [RiskReviewQueue, RiskReviewService],
})
export class RiskModule {}
