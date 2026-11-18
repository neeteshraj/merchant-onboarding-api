import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  applicationPayload,
  buildApplication,
} from '../../../test/fixtures/merchant-application.fixture.js';
import { InMemoryAuditLogRepository } from '../../../test/fakes/in-memory-audit-log.repository.js';
import { InMemoryMerchantApplicationRepository } from '../../../test/fakes/in-memory-merchant-application.repository.js';
import { InMemoryUserRepository } from '../../../test/fakes/in-memory-user.repository.js';
import {
  InlineTransactionRunner,
  RecordingRiskReviewQueue,
} from '../../../test/fakes/test-doubles.js';
import { AuditServiceImpl } from '../audit/audit.service.impl.js';
import { AuditAction } from '../audit/enums/audit-action.enum.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { RiskLevel, RiskStatus } from '../risk/enums/risk.enum.js';
import { Role } from '../users/enums/role.enum.js';
import { ApplicationsServiceImpl } from './applications.service.impl.js';
import { RoleBasedApplicationAccessPolicy } from './domain/role-based-application-access.policy.js';
import type { MerchantApplication } from './entities/merchant-application.entity.js';
import { ApplicationStatus } from './enums/application-status.enum.js';
import { ReviewDecision } from './enums/review-decision.enum.js';

const asActor = (user: { id: string; role: Role }): AuthenticatedUser => ({
  id: user.id,
  role: user.role,
});

describe('ApplicationsServiceImpl', () => {
  let applications: InMemoryMerchantApplicationRepository;
  let users: InMemoryUserRepository;
  let auditLogs: InMemoryAuditLogRepository;
  let queue: RecordingRiskReviewQueue;
  let service: ApplicationsServiceImpl;

  let admin: AuthenticatedUser;
  let sales: AuthenticatedUser;
  let otherSales: AuthenticatedUser;
  let reviewer: AuthenticatedUser;
  let otherReviewer: AuthenticatedUser;

  beforeEach(() => {
    applications = new InMemoryMerchantApplicationRepository();
    users = new InMemoryUserRepository();
    auditLogs = new InMemoryAuditLogRepository();
    queue = new RecordingRiskReviewQueue();
    service = new ApplicationsServiceImpl(
      new InlineTransactionRunner(),
      new RoleBasedApplicationAccessPolicy(),
      applications,
      users,
      new AuditServiceImpl(auditLogs),
      queue,
    );

    admin = asActor(users.add(Role.Admin));
    sales = asActor(users.add(Role.Sales));
    otherSales = asActor(users.add(Role.Sales));
    reviewer = asActor(users.add(Role.Reviewer));
    otherReviewer = asActor(users.add(Role.Reviewer));
  });

  const seed = (overrides: Partial<MerchantApplication> = {}) =>
    applications.seed(buildApplication({ createdById: sales.id, ...overrides }));

  const underReview = (overrides: Partial<MerchantApplication> = {}) =>
    seed({
      status: ApplicationStatus.UnderReview,
      assignedReviewerId: reviewer.id,
      riskStatus: RiskStatus.Completed,
      riskLevel: RiskLevel.Low,
      riskReviewVersion: 1,
      ...overrides,
    });

  describe('create', () => {
    it('creates a draft owned by the actor and audits it', async () => {
      const created = await service.create(applicationPayload(), sales);

      expect(created).toMatchObject({ status: ApplicationStatus.Draft, createdById: sales.id });
      expect(auditLogs.actions()).toEqual([AuditAction.ApplicationCreated]);
    });
  });

  describe('object-level isolation', () => {
    it('hides another sales user’s application as not found', async () => {
      const app = seed();
      await expect(service.findOne(app.id, otherSales)).rejects.toThrow(NotFoundException);
      await expect(service.update(app.id, { businessName: 'Hijack' }, otherSales)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.submit(app.id, otherSales)).rejects.toThrow(NotFoundException);
      expect(applications.get(app.id)?.businessName).toBe(app.businessName);
    });

    it('hides applications from reviewers they are not assigned to', async () => {
      const app = underReview();
      await expect(service.findOne(app.id, otherReviewer)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(app.id, reviewer)).resolves.toMatchObject({ id: app.id });
    });

    it('scopes listings to the caller', async () => {
      seed();
      seed();
      seed({ createdById: otherSales.id });

      expect((await service.list({ page: 1, limit: 20 }, sales)).meta.total).toBe(2);
      expect((await service.list({ page: 1, limit: 20 }, otherSales)).meta.total).toBe(1);
      expect((await service.list({ page: 1, limit: 20 }, admin)).meta.total).toBe(3);
      expect((await service.list({ page: 1, limit: 20 }, reviewer)).meta.total).toBe(0);
    });

    it('filters and paginates listings', async () => {
      for (let i = 0; i < 5; i += 1) seed();
      seed({ status: ApplicationStatus.Submitted });

      const page = await service.list(
        { page: 2, limit: 2, status: ApplicationStatus.Draft },
        sales,
      );
      expect(page.data).toHaveLength(2);
      expect(page.meta).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
    });

    it('forbids a reviewer who can see an application from editing it', async () => {
      const app = underReview({ status: ApplicationStatus.InfoRequested });
      await expect(service.update(app.id, { businessName: 'x' }, reviewer)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('applies changes while editable and records which fields changed', async () => {
      const app = seed();
      const updated = await service.update(app.id, { businessName: 'Renamed' }, sales);

      expect(updated.businessName).toBe('Renamed');
      expect(auditLogs.entries[0]?.metadata).toEqual({ changedFields: ['businessName'] });
    });

    it.each([
      ApplicationStatus.Submitted,
      ApplicationStatus.UnderReview,
      ApplicationStatus.Approved,
    ])('refuses edits while %s', async (status) => {
      const app = seed({ status, assignedReviewerId: reviewer.id });
      await expect(service.update(app.id, { businessName: 'x' }, sales)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('submit', () => {
    it('marks the risk review pending, bumps the version and enqueues exactly one job', async () => {
      const app = seed();
      const submitted = await service.submit(app.id, sales);

      expect(submitted).toMatchObject({
        status: ApplicationStatus.Submitted,
        riskStatus: RiskStatus.Pending,
        riskReviewVersion: 1,
      });
      expect(queue.jobs).toEqual([{ applicationId: app.id, reviewVersion: 1 }]);
    });

    it('does not enqueue when the transition is invalid', async () => {
      const app = seed({ status: ApplicationStatus.Submitted, riskReviewVersion: 1 });
      await expect(service.submit(app.id, sales)).rejects.toThrow(ConflictException);
      expect(queue.jobs).toHaveLength(0);
    });

    it('sends a resubmission back to the assigned reviewer with a fresh risk review', async () => {
      const app = underReview({ status: ApplicationStatus.InfoRequested, riskReviewVersion: 1 });
      const resubmitted = await service.submit(app.id, sales);

      expect(resubmitted).toMatchObject({
        status: ApplicationStatus.UnderReview,
        riskStatus: RiskStatus.Pending,
        riskLevel: null,
        riskReviewVersion: 2,
      });
      expect(queue.jobs).toEqual([{ applicationId: app.id, reviewVersion: 2 }]);
    });
  });

  describe('assignReviewer', () => {
    it('moves a submitted application under review', async () => {
      const app = seed({ status: ApplicationStatus.Submitted });
      const assigned = await service.assignReviewer(app.id, reviewer.id, admin);

      expect(assigned).toMatchObject({
        status: ApplicationStatus.UnderReview,
        assignedReviewerId: reviewer.id,
      });
      expect(auditLogs.actions()).toEqual([AuditAction.ReviewerAssigned]);
    });

    it.each([
      ['an unknown user', () => '00000000-0000-4000-8000-000000000000'],
      ['a non-reviewer', () => sales.id],
    ])('rejects %s as reviewer', async (_label, reviewerId) => {
      const app = seed({ status: ApplicationStatus.Submitted });
      await expect(service.assignReviewer(app.id, reviewerId(), admin)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses to assign a draft', async () => {
      const app = seed();
      await expect(service.assignReviewer(app.id, reviewer.id, admin)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('recordDecision', () => {
    it('lets the assigned reviewer approve once risk is complete', async () => {
      const app = underReview();
      const decided = await service.recordDecision(
        app.id,
        { decision: ReviewDecision.Approve },
        reviewer,
      );

      expect(decided.status).toBe(ApplicationStatus.Approved);
      expect(decided.decidedAt).toBeInstanceOf(Date);
      expect(auditLogs.actions()).toEqual([AuditAction.DecisionRecorded]);
    });

    it('treats an unassigned reviewer as not found', async () => {
      const app = underReview();
      await expect(
        service.recordDecision(app.id, { decision: ReviewDecision.Approve }, otherReviewer),
      ).rejects.toThrow(NotFoundException);
    });

    it('forbids admins from deciding', async () => {
      const app = underReview();
      await expect(
        service.recordDecision(app.id, { decision: ReviewDecision.Approve }, admin),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks approval while the risk review is pending', async () => {
      const app = underReview({ riskStatus: RiskStatus.Pending, riskLevel: null });
      await expect(
        service.recordDecision(app.id, { decision: ReviewDecision.Approve }, reviewer),
      ).rejects.toThrow(ConflictException);
      expect(applications.get(app.id)?.status).toBe(ApplicationStatus.UnderReview);
    });

    it('records the reason when requesting information', async () => {
      const app = underReview();
      const decided = await service.recordDecision(
        app.id,
        { decision: ReviewDecision.RequestInfo, reason: 'Need incorporation certificate' },
        reviewer,
      );
      expect(decided).toMatchObject({
        status: ApplicationStatus.InfoRequested,
        decisionReason: 'Need incorporation certificate',
      });
    });
  });

  describe('requeueRiskReview', () => {
    it('starts a new review version after a failure', async () => {
      const app = seed({
        status: ApplicationStatus.Submitted,
        riskStatus: RiskStatus.Failed,
        riskReviewVersion: 3,
      });
      const requeued = await service.requeueRiskReview(app.id, admin);

      expect(requeued).toMatchObject({ riskStatus: RiskStatus.Pending, riskReviewVersion: 4 });
      expect(queue.jobs).toEqual([{ applicationId: app.id, reviewVersion: 4 }]);
    });

    it('refuses when the review already completed', async () => {
      const app = underReview();
      await expect(service.requeueRiskReview(app.id, admin)).rejects.toThrow(ConflictException);
      expect(queue.jobs).toHaveLength(0);
    });
  });

  describe('audit trail', () => {
    it('never stores raw sensitive values', async () => {
      const app = seed();
      await service.update(
        app.id,
        { taxId: 'TEST-999999999', ownerEmail: 'new.owner@example.com' },
        sales,
      );

      const serialized = JSON.stringify(auditLogs.entries);
      expect(serialized).not.toContain('TEST-999999999');
      expect(serialized).not.toContain('new.owner@example.com');
    });
  });
});
