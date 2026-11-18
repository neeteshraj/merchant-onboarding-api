import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { RiskReviewQueue } from '../src/modules/risk/queue/risk-review.queue.js';
import { RISK_REVIEW_QUEUE } from '../src/modules/risk/queue/risk-review-queue.constants.js';
import { RiskStatus } from '../src/modules/risk/enums/risk.enum.js';
import { AuditAction } from '../src/modules/audit/enums/audit-action.enum.js';
import { ApiClient } from './utils/api-client.js';
import { createTestApp, type TestContext, waitForIdleQueue } from './utils/test-app.js';

interface AssessmentRow {
  review_version: number;
  attempts: number;
}

describe('Asynchronous risk review (e2e)', () => {
  let ctx: TestContext;
  let api: ApiClient;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = new ApiClient(ctx.server);
  });

  beforeEach(() => ctx.resetApplications());

  afterAll(() => ctx.close());

  const assessments = (applicationId: string): Promise<AssessmentRow[]> =>
    ctx.dataSource.query(
      'SELECT review_version, attempts FROM risk_assessments WHERE application_id = $1 ORDER BY review_version',
      [applicationId],
    );

  const auditActions = async (applicationId: string): Promise<string[]> => {
    const response = await api
      .as(ctx.users.admin)
      .get(`/applications/${applicationId}/audit-logs`)
      .expect(200);
    return response.body.map((entry: { action: string }) => entry.action);
  };

  async function submitNew(): Promise<string> {
    const application = await api.createApplication(ctx.users.sales);
    await api.as(ctx.users.sales).post(`/applications/${application.id}/submit`).expect(200);
    return application.id;
  }

  it('processes the submission in the background and persists the result', async () => {
    const id = await submitNew();
    const reviewed = await api.waitForRiskResult(ctx.users.sales, id);

    expect(reviewed).toMatchObject({
      riskStatus: RiskStatus.Completed,
      riskScore: 25,
      riskLevel: 'LOW',
    });
    expect(await assessments(id)).toEqual([{ review_version: 1, attempts: 1 }]);
    expect(ctx.kyb.requests).toHaveLength(1);
  });

  it('retries transient provider failures with backoff and records the attempt count', async () => {
    ctx.kyb.failuresBeforeSuccess = 2;
    const id = await submitNew();

    await expect(api.waitForRiskResult(ctx.users.sales, id)).resolves.toMatchObject({
      riskStatus: RiskStatus.Completed,
    });
    expect(ctx.kyb.requests).toHaveLength(3);
    expect(await assessments(id)).toEqual([{ review_version: 1, attempts: 3 }]);
  });

  it('marks the review FAILED once retries are exhausted, and an admin can requeue it', async () => {
    ctx.kyb.failuresBeforeSuccess = Number.POSITIVE_INFINITY;
    const id = await submitNew();

    await expect(api.waitForRiskResult(ctx.users.sales, id)).resolves.toMatchObject({
      riskStatus: RiskStatus.Failed,
    });
    expect(ctx.kyb.requests).toHaveLength(3);
    expect(await auditActions(id)).toContain(AuditAction.RiskReviewFailed);

    ctx.kyb.reset();
    const requeued = await api
      .as(ctx.users.admin)
      .post(`/applications/${id}/risk-review`)
      .expect(202);
    expect(requeued.body).toMatchObject({ riskStatus: RiskStatus.Pending });

    await expect(api.waitForRiskResult(ctx.users.sales, id)).resolves.toMatchObject({
      riskStatus: RiskStatus.Completed,
    });
    expect(await assessments(id)).toEqual([{ review_version: 2, attempts: 1 }]);
  });

  it('is idempotent when the same review is enqueued repeatedly', async () => {
    const id = await submitNew();
    const producer = ctx.app.get(RiskReviewQueue);
    await Promise.all(
      [1, 2, 3].map(() => producer.enqueue({ applicationId: id, reviewVersion: 1 })),
    );

    await api.waitForRiskResult(ctx.users.sales, id);
    await waitForIdleQueue(ctx.app.get<Queue>(getQueueToken(RISK_REVIEW_QUEUE)));

    expect(await assessments(id)).toHaveLength(1);
    expect(
      (await auditActions(id)).filter((a) => a === AuditAction.RiskReviewCompleted),
    ).toHaveLength(1);
    expect(ctx.kyb.requests).toHaveLength(1);
  });

  it('ignores a stale job from a superseded review version', async () => {
    const id = await submitNew();
    await api.waitForRiskResult(ctx.users.sales, id);

    await ctx.app.get(RiskReviewQueue).enqueue({ applicationId: id, reviewVersion: 0 });
    await waitForIdleQueue(ctx.app.get<Queue>(getQueueToken(RISK_REVIEW_QUEUE)));

    expect(await assessments(id)).toHaveLength(1);
    expect(ctx.kyb.requests).toHaveLength(1);
  });

  it('refuses to requeue a review that already completed', async () => {
    const id = await submitNew();
    await api.waitForRiskResult(ctx.users.sales, id);
    await api.as(ctx.users.admin).post(`/applications/${id}/risk-review`).expect(409);
  });
});
