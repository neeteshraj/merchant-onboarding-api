import { Injectable, Logger } from '@nestjs/common';
import { TransactionRunner } from '../../database/transaction-runner.js';
import type { MerchantApplication } from '../applications/entities/merchant-application.entity.js';
import { MerchantApplicationRepository } from '../applications/repositories/merchant-application.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction, AuditEntityType } from '../audit/enums/audit-action.enum.js';
import { RiskStatus } from './enums/risk.enum.js';
import { type KybCheckResult, KybProvider } from './providers/kyb-provider.js';
import type { RiskReviewJobData } from './queue/risk-review.queue.js';
import { RiskAssessmentRepository } from './repositories/risk-assessment.repository.js';
import { type RiskReviewOutcome, RiskReviewService } from './risk-review.service.js';

/**
 * Idempotency is layered:
 * 1. deterministic job ids prevent duplicate jobs,
 * 2. a version check under a row lock discards stale or already-processed jobs,
 * 3. a unique constraint on `(application_id, review_version)` rejects any duplicate that slips through.
 */
@Injectable()
export class RiskReviewServiceImpl extends RiskReviewService {
  private readonly logger = new Logger(RiskReviewService.name);

  constructor(
    private readonly transactions: TransactionRunner,
    private readonly applications: MerchantApplicationRepository,
    private readonly assessments: RiskAssessmentRepository,
    private readonly kyb: KybProvider,
    private readonly audit: AuditService,
  ) {
    super();
  }

  /**
   * The provider call happens outside the transaction so no row lock is held
   * during network I/O; the state is re-validated under lock before writing.
   */
  async process(job: RiskReviewJobData, attempt: number): Promise<RiskReviewOutcome> {
    const application = await this.applications.findById(job.applicationId);
    if (!this.isAwaitingResult(application, job)) {
      this.logger.log(`Skipping stale risk review ${job.applicationId} v${job.reviewVersion}`);
      return 'skipped';
    }

    const result = await this.kyb.check({
      idempotencyKey: `${job.applicationId}:v${job.reviewVersion}`,
      legalBusinessName: application.legalBusinessName,
      taxId: application.taxId,
      businessType: application.businessType,
      mcc: application.mcc,
      expectedMonthlyVolume: application.expectedMonthlyVolume,
    });

    return this.recordResult(job, result, attempt);
  }

  recordResult(
    job: RiskReviewJobData,
    result: KybCheckResult,
    attempt: number,
  ): Promise<RiskReviewOutcome> {
    return this.transactions.run(async () => {
      const locked = await this.applications.findById(job.applicationId, { lock: true });
      if (!this.isAwaitingResult(locked, job)) return 'skipped';

      await this.assessments.create({
        applicationId: job.applicationId,
        reviewVersion: job.reviewVersion,
        provider: result.provider,
        providerReference: result.reference,
        score: result.score,
        level: result.level,
        reasons: result.reasons,
        attempts: attempt,
      });
      locked.riskStatus = RiskStatus.Completed;
      locked.riskScore = result.score;
      locked.riskLevel = result.level;
      await this.applications.save(locked);
      await this.audit.record({
        actorId: null,
        action: AuditAction.RiskReviewCompleted,
        entityType: AuditEntityType.MerchantApplication,
        entityId: job.applicationId,
        metadata: {
          reviewVersion: job.reviewVersion,
          score: result.score,
          level: result.level,
          reasons: result.reasons,
          attempts: attempt,
        },
      });
      return 'applied';
    });
  }

  markFailed(job: RiskReviewJobData, reason: string): Promise<RiskReviewOutcome> {
    return this.transactions.run(async () => {
      const locked = await this.applications.findById(job.applicationId, { lock: true });
      if (!this.isAwaitingResult(locked, job)) return 'skipped';

      locked.riskStatus = RiskStatus.Failed;
      await this.applications.save(locked);
      await this.audit.record({
        actorId: null,
        action: AuditAction.RiskReviewFailed,
        entityType: AuditEntityType.MerchantApplication,
        entityId: job.applicationId,
        metadata: { reviewVersion: job.reviewVersion, reason },
      });
      return 'applied';
    });
  }

  private isAwaitingResult(
    application: MerchantApplication | null,
    job: RiskReviewJobData,
  ): application is MerchantApplication {
    return (
      application !== null &&
      application.riskReviewVersion === job.reviewVersion &&
      application.riskStatus === RiskStatus.Pending
    );
  }
}
