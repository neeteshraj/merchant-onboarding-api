import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginationMetaDto } from '../../common/dto/pagination.dto.js';
import { TransactionRunner } from '../../database/transaction-runner.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuditLog } from '../audit/entities/audit-log.entity.js';
import { AuditAction, AuditEntityType } from '../audit/enums/audit-action.enum.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { RiskStatus } from '../risk/enums/risk.enum.js';
import { RiskReviewQueue } from '../risk/queue/risk-review.queue.js';
import { Role } from '../users/enums/role.enum.js';
import { UserRepository } from '../users/repositories/user.repository.js';
import { ApplicationsService, type Page } from './applications.service.js';
import { ApplicationAccessPolicy } from './domain/application-access.policy.js';
import {
  assertEditable,
  assertRiskReviewRequeueable,
  resolveAssignTarget,
  resolveDecisionTarget,
  resolveSubmitTarget,
} from './domain/application-lifecycle.js';
import type { CreateApplicationDto } from './dto/create-application.dto.js';
import type { ListApplicationsQueryDto } from './dto/list-applications-query.dto.js';
import type { RecordDecisionDto } from './dto/record-decision.dto.js';
import type { UpdateApplicationDto } from './dto/update-application.dto.js';
import type { MerchantApplication } from './entities/merchant-application.entity.js';
import { MerchantApplicationRepository } from './repositories/merchant-application.repository.js';

/**
 * Orchestrates the merchant application lifecycle. Every mutation runs in a
 * transaction holding a row lock, writes its audit record atomically, and
 * delegates authorization to {@link ApplicationAccessPolicy} and status rules
 * to the pure lifecycle functions.
 */
@Injectable()
export class ApplicationsServiceImpl extends ApplicationsService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly policy: ApplicationAccessPolicy,
    private readonly applications: MerchantApplicationRepository,
    private readonly users: UserRepository,
    private readonly audit: AuditService,
    private readonly riskQueue: RiskReviewQueue,
  ) {
    super();
  }

  create(dto: CreateApplicationDto, actor: AuthenticatedUser): Promise<MerchantApplication> {
    return this.transactions.run(async () => {
      const application = await this.applications.create({ ...dto, createdById: actor.id });
      await this.recordAudit(actor, application.id, AuditAction.ApplicationCreated, {
        businessName: application.businessName,
        status: application.status,
      });
      return application;
    });
  }

  async list(
    query: ListApplicationsQueryDto,
    actor: AuthenticatedUser,
  ): Promise<Page<MerchantApplication>> {
    const { items, total } = await this.applications.findPage({
      scope: this.policy.visibilityScope(actor),
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
    return { data: items, meta: PaginationMetaDto.of(query.page, query.limit, total) };
  }

  findOne(id: string, actor: AuthenticatedUser): Promise<MerchantApplication> {
    return this.findVisibleOrFail(id, actor);
  }

  update(
    id: string,
    dto: UpdateApplicationDto,
    actor: AuthenticatedUser,
  ): Promise<MerchantApplication> {
    return this.transactions.run(async () => {
      const application = await this.findVisibleOrFail(id, actor, true);
      this.assertCanModify(actor, application);
      assertEditable(application.status);

      const saved = await this.applications.save(Object.assign(application, dto));
      await this.recordAudit(actor, id, AuditAction.ApplicationUpdated, {
        changedFields: Object.keys(dto),
      });
      return saved;
    });
  }

  /** The job is enqueued only after the transaction commits, so the worker never observes uncommitted state. */
  async submit(id: string, actor: AuthenticatedUser): Promise<MerchantApplication> {
    const application = await this.transactions.run(async () => {
      const current = await this.findVisibleOrFail(id, actor, true);
      this.assertCanModify(actor, current);
      const fromStatus = current.status;

      current.status = resolveSubmitTarget(current);
      current.riskStatus = RiskStatus.Pending;
      current.riskScore = null;
      current.riskLevel = null;
      current.riskReviewVersion += 1;
      current.submittedAt = new Date();
      const saved = await this.applications.save(current);

      await this.recordAudit(actor, id, AuditAction.ApplicationSubmitted, {
        fromStatus,
        toStatus: saved.status,
        reviewVersion: saved.riskReviewVersion,
      });
      return saved;
    });

    await this.riskQueue.enqueue({
      applicationId: id,
      reviewVersion: application.riskReviewVersion,
    });
    return application;
  }

  async assignReviewer(
    id: string,
    reviewerId: string,
    actor: AuthenticatedUser,
  ): Promise<MerchantApplication> {
    const reviewer = await this.users.findById(reviewerId);
    if (reviewer?.role !== Role.Reviewer) {
      throw new BadRequestException('reviewerId must reference a user with the REVIEWER role');
    }

    return this.transactions.run(async () => {
      const current = await this.findVisibleOrFail(id, actor, true);
      const fromStatus = current.status;
      const previousReviewerId = current.assignedReviewerId;

      current.status = resolveAssignTarget(current);
      current.assignedReviewerId = reviewerId;
      const saved = await this.applications.save(current);

      await this.recordAudit(actor, id, AuditAction.ReviewerAssigned, {
        reviewerId,
        previousReviewerId,
        fromStatus,
        toStatus: saved.status,
      });
      return saved;
    });
  }

  recordDecision(
    id: string,
    dto: RecordDecisionDto,
    actor: AuthenticatedUser,
  ): Promise<MerchantApplication> {
    return this.transactions.run(async () => {
      const current = await this.findVisibleOrFail(id, actor, true);
      if (!this.policy.canDecide(actor, current)) {
        throw new ForbiddenException('Only the assigned reviewer can record a decision');
      }
      const fromStatus = current.status;

      current.status = resolveDecisionTarget(current, dto.decision);
      current.decisionReason = dto.reason ?? null;
      current.decidedAt = new Date();
      const saved = await this.applications.save(current);

      await this.recordAudit(actor, id, AuditAction.DecisionRecorded, {
        decision: dto.decision,
        fromStatus,
        toStatus: saved.status,
        riskLevel: saved.riskLevel,
        reason: saved.decisionReason,
      });
      return saved;
    });
  }

  async requeueRiskReview(id: string, actor: AuthenticatedUser): Promise<MerchantApplication> {
    const application = await this.transactions.run(async () => {
      const current = await this.findVisibleOrFail(id, actor, true);
      assertRiskReviewRequeueable(current);
      const previousRiskStatus = current.riskStatus;

      current.riskStatus = RiskStatus.Pending;
      current.riskReviewVersion += 1;
      const saved = await this.applications.save(current);

      await this.recordAudit(actor, id, AuditAction.RiskReviewRequeued, {
        previousRiskStatus,
        reviewVersion: saved.riskReviewVersion,
      });
      return saved;
    });

    await this.riskQueue.enqueue({
      applicationId: id,
      reviewVersion: application.riskReviewVersion,
    });
    return application;
  }

  async auditTrail(id: string, actor: AuthenticatedUser): Promise<AuditLog[]> {
    await this.findVisibleOrFail(id, actor);
    return this.audit.findForEntity(AuditEntityType.MerchantApplication, id);
  }

  /**
   * Loads an application only if it lies within the caller's visibility scope.
   * @param lock take a row lock; only meaningful inside a transaction.
   */
  private async findVisibleOrFail(
    id: string,
    actor: AuthenticatedUser,
    lock = false,
  ): Promise<MerchantApplication> {
    const application = await this.applications.findById(id, {
      scope: this.policy.visibilityScope(actor),
      lock,
    });
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  private assertCanModify(actor: AuthenticatedUser, application: MerchantApplication): void {
    if (!this.policy.canModify(actor, application)) {
      throw new ForbiddenException('You are not allowed to modify this application');
    }
  }

  private recordAudit(
    actor: AuthenticatedUser,
    applicationId: string,
    action: AuditAction,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      actorId: actor.id,
      action,
      entityType: AuditEntityType.MerchantApplication,
      entityId: applicationId,
      metadata,
    });
  }
}
