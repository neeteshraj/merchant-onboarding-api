import { buildApplication } from '../../../test/fixtures/merchant-application.fixture.js';
import { InMemoryAuditLogRepository } from '../../../test/fakes/in-memory-audit-log.repository.js';
import { InMemoryMerchantApplicationRepository } from '../../../test/fakes/in-memory-merchant-application.repository.js';
import { InMemoryRiskAssessmentRepository } from '../../../test/fakes/in-memory-risk-assessment.repository.js';
import { InMemoryWebhookEventRepository } from '../../../test/fakes/in-memory-webhook-event.repository.js';
import { InlineTransactionRunner, ScriptedKybProvider } from '../../../test/fakes/test-doubles.js';
import { ApplicationStatus } from '../applications/enums/application-status.enum.js';
import { AuditServiceImpl } from '../audit/audit.service.impl.js';
import { RiskLevel, RiskStatus } from '../risk/enums/risk.enum.js';
import { RiskReviewServiceImpl } from '../risk/risk-review.service.impl.js';
import type { KybWebhookEventDto } from './dto/kyb-webhook-event.dto.js';
import { KybWebhookEventType } from './enums/kyb-webhook-event-type.enum.js';
import { KybWebhookServiceImpl } from './kyb-webhook.service.impl.js';

const completed = (
  applicationId: string,
  overrides: Partial<KybWebhookEventDto> = {},
): KybWebhookEventDto => ({
  eventId: 'evt_completed_1',
  type: KybWebhookEventType.CheckCompleted,
  applicationId,
  reviewVersion: 1,
  result: { reference: 'sim_ref', score: 81, level: RiskLevel.High, reasons: ['HIGH_RISK_MCC'] },
  ...overrides,
});

describe('KybWebhookServiceImpl', () => {
  let applications: InMemoryMerchantApplicationRepository;
  let assessments: InMemoryRiskAssessmentRepository;
  let events: InMemoryWebhookEventRepository;
  let service: KybWebhookServiceImpl;

  beforeEach(() => {
    applications = new InMemoryMerchantApplicationRepository();
    assessments = new InMemoryRiskAssessmentRepository();
    events = new InMemoryWebhookEventRepository();
    const transactions = new InlineTransactionRunner();
    const reviews = new RiskReviewServiceImpl(
      transactions,
      applications,
      assessments,
      new ScriptedKybProvider(),
      new AuditServiceImpl(new InMemoryAuditLogRepository()),
    );
    service = new KybWebhookServiceImpl(transactions, events, reviews);
  });

  const pending = (reviewVersion = 1) =>
    applications.seed(
      buildApplication({
        status: ApplicationStatus.Submitted,
        riskStatus: RiskStatus.Pending,
        riskReviewVersion: reviewVersion,
      }),
    );

  it('applies a completed check', async () => {
    const app = pending();
    await expect(service.handle(completed(app.id))).resolves.toBe('processed');

    expect(applications.get(app.id)).toMatchObject({
      riskStatus: RiskStatus.Completed,
      riskScore: 81,
      riskLevel: RiskLevel.High,
    });
    expect(assessments.rows).toHaveLength(1);
  });

  it('acknowledges a redelivered event id as a duplicate without reprocessing', async () => {
    const app = pending();
    await service.handle(completed(app.id));
    await expect(service.handle(completed(app.id))).resolves.toBe('duplicate');
    expect(assessments.rows).toHaveLength(1);
  });

  it('ignores a new event for a review that is already settled', async () => {
    const app = pending();
    await service.handle(completed(app.id));
    await expect(service.handle(completed(app.id, { eventId: 'evt_completed_2' }))).resolves.toBe(
      'ignored',
    );
    expect(assessments.rows).toHaveLength(1);
  });

  it('ignores results for a superseded review version', async () => {
    const app = pending(2);
    await expect(service.handle(completed(app.id, { reviewVersion: 1 }))).resolves.toBe('ignored');
    expect(applications.get(app.id)?.riskStatus).toBe(RiskStatus.Pending);
  });

  it('marks the review failed on a failure event', async () => {
    const app = pending();
    const outcome = await service.handle({
      eventId: 'evt_failed_1',
      type: KybWebhookEventType.CheckFailed,
      applicationId: app.id,
      reviewVersion: 1,
      failureReason: 'Registry unavailable',
    });

    expect(outcome).toBe('processed');
    expect(applications.get(app.id)?.riskStatus).toBe(RiskStatus.Failed);
  });

  it('stores only a redacted copy of the payload', async () => {
    const app = pending();
    await service.handle({ ...completed(app.id), taxId: 'TEST-555555555' } as KybWebhookEventDto);
    expect(JSON.stringify(events.events)).not.toContain('TEST-555555555');
  });
});
