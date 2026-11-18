import { buildApplication } from '../../../test/fixtures/merchant-application.fixture.js';
import { InMemoryAuditLogRepository } from '../../../test/fakes/in-memory-audit-log.repository.js';
import { InMemoryMerchantApplicationRepository } from '../../../test/fakes/in-memory-merchant-application.repository.js';
import { InMemoryRiskAssessmentRepository } from '../../../test/fakes/in-memory-risk-assessment.repository.js';
import { InlineTransactionRunner, ScriptedKybProvider } from '../../../test/fakes/test-doubles.js';
import { ApplicationStatus } from '../applications/enums/application-status.enum.js';
import { AuditServiceImpl } from '../audit/audit.service.impl.js';
import { AuditAction } from '../audit/enums/audit-action.enum.js';
import { RiskLevel, RiskStatus } from './enums/risk.enum.js';
import { TransientKybError } from './providers/kyb-provider.js';
import { RiskReviewServiceImpl } from './risk-review.service.impl.js';

describe('RiskReviewServiceImpl', () => {
  let applications: InMemoryMerchantApplicationRepository;
  let assessments: InMemoryRiskAssessmentRepository;
  let auditLogs: InMemoryAuditLogRepository;
  let kyb: ScriptedKybProvider;
  let service: RiskReviewServiceImpl;

  beforeEach(() => {
    applications = new InMemoryMerchantApplicationRepository();
    assessments = new InMemoryRiskAssessmentRepository();
    auditLogs = new InMemoryAuditLogRepository();
    kyb = new ScriptedKybProvider();
    service = new RiskReviewServiceImpl(
      new InlineTransactionRunner(),
      applications,
      assessments,
      kyb,
      new AuditServiceImpl(auditLogs),
    );
  });

  const pendingApplication = (reviewVersion = 1) =>
    applications.seed(
      buildApplication({
        status: ApplicationStatus.Submitted,
        riskStatus: RiskStatus.Pending,
        riskReviewVersion: reviewVersion,
      }),
    );

  it('persists the provider result and completes the review', async () => {
    const app = pendingApplication();
    kyb.result = { ...kyb.result, score: 72, level: RiskLevel.High, reasons: ['HIGH_RISK_MCC'] };

    await expect(service.process({ applicationId: app.id, reviewVersion: 1 }, 2)).resolves.toBe(
      'applied',
    );

    expect(applications.get(app.id)).toMatchObject({
      riskStatus: RiskStatus.Completed,
      riskScore: 72,
      riskLevel: RiskLevel.High,
    });
    expect(assessments.rows).toEqual([
      expect.objectContaining({ applicationId: app.id, reviewVersion: 1, score: 72, attempts: 2 }),
    ]);
    expect(auditLogs.entries).toEqual([
      expect.objectContaining({ actorId: null, action: AuditAction.RiskReviewCompleted }),
    ]);
  });

  it('sends a stable idempotency key to the provider', async () => {
    const app = pendingApplication(4);
    await service.process({ applicationId: app.id, reviewVersion: 4 }, 1);
    expect(kyb.requests[0]?.idempotencyKey).toBe(`${app.id}:v4`);
  });

  it('is idempotent: redelivering the same job persists nothing new and skips the provider', async () => {
    const app = pendingApplication();
    const job = { applicationId: app.id, reviewVersion: 1 };

    await service.process(job, 1);
    await expect(service.process(job, 1)).resolves.toBe('skipped');

    expect(assessments.rows).toHaveLength(1);
    expect(auditLogs.entries).toHaveLength(1);
    expect(kyb.requests).toHaveLength(1);
  });

  it('discards results for a superseded review version', async () => {
    const app = pendingApplication(2);
    await expect(service.process({ applicationId: app.id, reviewVersion: 1 }, 1)).resolves.toBe(
      'skipped',
    );
    expect(applications.get(app.id)?.riskStatus).toBe(RiskStatus.Pending);
    expect(kyb.requests).toHaveLength(0);
  });

  it('skips jobs for applications that no longer exist', async () => {
    await expect(
      service.process(
        { applicationId: '00000000-0000-4000-8000-000000000000', reviewVersion: 1 },
        1,
      ),
    ).resolves.toBe('skipped');
  });

  it('propagates provider failures so the queue retries, leaving state untouched', async () => {
    const app = pendingApplication();
    kyb.failuresBeforeSuccess = 1;

    await expect(service.process({ applicationId: app.id, reviewVersion: 1 }, 1)).rejects.toThrow(
      TransientKybError,
    );
    expect(applications.get(app.id)?.riskStatus).toBe(RiskStatus.Pending);
    expect(assessments.rows).toHaveLength(0);

    await expect(service.process({ applicationId: app.id, reviewVersion: 1 }, 2)).resolves.toBe(
      'applied',
    );
  });

  describe('markFailed', () => {
    it('marks a pending review as failed and audits the reason', async () => {
      const app = pendingApplication();
      await service.markFailed({ applicationId: app.id, reviewVersion: 1 }, 'provider timeout');

      expect(applications.get(app.id)?.riskStatus).toBe(RiskStatus.Failed);
      expect(auditLogs.entries[0]).toMatchObject({
        action: AuditAction.RiskReviewFailed,
        metadata: { reviewVersion: 1, reason: 'provider timeout' },
      });
    });

    it('ignores failures of superseded reviews', async () => {
      const app = pendingApplication(2);
      await service.markFailed({ applicationId: app.id, reviewVersion: 1 }, 'late failure');

      expect(applications.get(app.id)?.riskStatus).toBe(RiskStatus.Pending);
      expect(auditLogs.entries).toHaveLength(0);
    });
  });
});
