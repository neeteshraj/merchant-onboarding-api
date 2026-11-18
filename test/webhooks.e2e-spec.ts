import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { RiskLevel, RiskStatus } from '../src/modules/risk/enums/risk.enum.js';
import { RISK_REVIEW_QUEUE } from '../src/modules/risk/queue/risk-review-queue.constants.js';
import { KybWebhookEventType } from '../src/modules/webhooks/enums/kyb-webhook-event-type.enum.js';
import { KYB_SIGNATURE_HEADER } from '../src/modules/webhooks/guards/kyb-webhook-signature.guard.js';
import { signWebhookPayload } from '../src/modules/webhooks/signature/hmac-webhook-signature-verifier.js';
import { ApiClient } from './utils/api-client.js';
import { createTestApp, type TestContext, waitFor, waitForIdleQueue } from './utils/test-app.js';

interface DeliveryOptions {
  secret?: string;
  timestamp?: number;
  signature?: string | null;
}

const secret = (): string => process.env.KYB_WEBHOOK_SECRET ?? '';

const completedEvent = (applicationId: string, eventId = 'evt_completed_0001') => ({
  eventId,
  type: KybWebhookEventType.CheckCompleted,
  applicationId,
  reviewVersion: 1,
  result: {
    reference: 'sim_webhook_ref',
    score: 88,
    level: RiskLevel.High,
    reasons: ['HIGH_RISK_MCC'],
  },
});

describe('KYB webhook (e2e)', () => {
  let ctx: TestContext;
  let api: ApiClient;
  let releaseProvider: (() => void) | undefined;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = new ApiClient(ctx.server);
  });

  beforeEach(() => ctx.resetApplications());

  afterEach(() => releaseProvider?.());

  afterAll(() => ctx.close());

  function deliver(event: object, options: DeliveryOptions = {}) {
    const body = JSON.stringify(event);
    const req = request(ctx.server).post('/webhooks/kyb').set('Content-Type', 'application/json');
    const signature =
      options.signature === undefined
        ? signWebhookPayload(options.secret ?? secret(), body, options.timestamp)
        : options.signature;
    if (signature !== null) req.set(KYB_SIGNATURE_HEADER, signature);
    return req.send(body);
  }

  /** Submits an application while the worker's provider call is held open, so the review stays PENDING. */
  async function pendingApplication(): Promise<string> {
    releaseProvider = ctx.kyb.hold();
    const application = await api.createApplication(ctx.users.sales);
    await api.as(ctx.users.sales).post(`/applications/${application.id}/submit`).expect(200);
    await waitFor(async () => (ctx.kyb.requests.length > 0 ? true : undefined));
    return application.id;
  }

  describe('authentication', () => {
    const anyEvent = completedEvent('7b0f1c2e-3c4d-4e5f-8a6b-7c8d9e0f1a2b');

    it('rejects a request without a signature', async () => {
      await deliver(anyEvent, { signature: null }).expect(401);
    });

    it('rejects a signature made with the wrong secret', async () => {
      await deliver(anyEvent, { secret: 'wrong-secret-wrong-secret-wrong-secret' }).expect(401);
    });

    it('rejects an expired signature', async () => {
      await deliver(anyEvent, { timestamp: Math.floor(Date.now() / 1000) - 3600 }).expect(401);
    });

    it('rejects a body altered after signing', async () => {
      const signature = signWebhookPayload(secret(), JSON.stringify(anyEvent));
      await deliver({ ...anyEvent, reviewVersion: 2 }, { signature }).expect(401);
    });

    it('does not require a JWT', async () => {
      await deliver(anyEvent).expect(200);
    });
  });

  it('validates an authenticated payload', async () => {
    await deliver({ eventId: 'evt_invalid_0001', type: KybWebhookEventType.CheckCompleted }).expect(
      400,
    );
    await deliver({
      ...completedEvent('7b0f1c2e-3c4d-4e5f-8a6b-7c8d9e0f1a2b'),
      result: { reference: 'x', score: 500, level: 'EXTREME', reasons: [] },
    }).expect(400);
  });

  it('completes a pending review, and the worker’s late result is discarded', async () => {
    const id = await pendingApplication();

    const response = await deliver(completedEvent(id)).expect(200);
    expect(response.body).toEqual({ status: 'processed' });
    expect(await api.getApplication(ctx.users.sales, id)).toMatchObject({
      riskStatus: RiskStatus.Completed,
      riskScore: 88,
      riskLevel: RiskLevel.High,
    });

    releaseProvider?.();
    await waitForIdleQueue(ctx.app.get<Queue>(getQueueToken(RISK_REVIEW_QUEUE)));

    const rows: Array<{ provider_reference: string }> = await ctx.dataSource.query(
      'SELECT provider_reference FROM risk_assessments WHERE application_id = $1',
      [id],
    );
    expect(rows).toEqual([{ provider_reference: 'sim_webhook_ref' }]);
    expect((await api.getApplication(ctx.users.sales, id)).riskScore).toBe(88);
  });

  it('de-duplicates redeliveries of the same event id', async () => {
    const id = await pendingApplication();

    const responses = await Promise.all([1, 2, 3].map(() => deliver(completedEvent(id))));
    const statuses = responses.map((r) => (r.body as { status: string }).status).toSorted();
    expect(statuses).toEqual(['duplicate', 'duplicate', 'processed']);

    const [{ count }]: Array<{ count: string }> = await ctx.dataSource.query(
      'SELECT count(*) FROM webhook_events WHERE event_id = $1',
      ['evt_completed_0001'],
    );
    expect(Number(count)).toBe(1);
  });

  it('ignores a different event for an already settled review', async () => {
    const id = await pendingApplication();
    await deliver(completedEvent(id)).expect(200);

    const response = await deliver(completedEvent(id, 'evt_completed_0002')).expect(200);
    expect(response.body).toEqual({ status: 'ignored' });
  });

  it('marks the review failed on a failure callback', async () => {
    const id = await pendingApplication();
    const response = await deliver({
      eventId: 'evt_failed_00001',
      type: KybWebhookEventType.CheckFailed,
      applicationId: id,
      reviewVersion: 1,
      failureReason: 'Registry unavailable',
    }).expect(200);

    expect(response.body).toEqual({ status: 'processed' });
    expect((await api.getApplication(ctx.users.sales, id)).riskStatus).toBe(RiskStatus.Failed);
  });
});
