import { ApplicationStatus } from '../src/modules/applications/enums/application-status.enum.js';
import { AuditAction } from '../src/modules/audit/enums/audit-action.enum.js';
import { RiskStatus } from '../src/modules/risk/enums/risk.enum.js';
import { ApiClient } from './utils/api-client.js';
import { createTestApp, type TestContext } from './utils/test-app.js';

describe('Applications lifecycle (e2e)', () => {
  let ctx: TestContext;
  let api: ApiClient;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = new ApiClient(ctx.server);
  });

  beforeEach(() => ctx.resetApplications());

  afterAll(() => ctx.close());

  it('runs the happy path from draft to approval with a full audit trail', async () => {
    const { sales, admin, reviewer } = ctx.users;

    const created = await api.createApplication(sales);
    expect(created).toMatchObject({
      status: ApplicationStatus.Draft,
      riskStatus: RiskStatus.NotStarted,
      taxIdMasked: '***6789',
    });
    expect(created).not.toHaveProperty('taxId');

    await api
      .as(sales)
      .patch(`/applications/${created.id}`, { businessName: 'Renamed Coffee' })
      .expect(200);

    const submitted = await api.as(sales).post(`/applications/${created.id}/submit`).expect(200);
    expect(submitted.body).toMatchObject({
      status: ApplicationStatus.Submitted,
      riskStatus: RiskStatus.Pending,
    });

    const reviewed = await api.waitForRiskResult(sales, created.id);
    expect(reviewed).toMatchObject({
      riskStatus: RiskStatus.Completed,
      riskLevel: 'LOW',
      riskScore: 25,
    });

    await api
      .as(admin)
      .post(`/applications/${created.id}/assign`, { reviewerId: reviewer.id })
      .expect(200);

    const approved = await api
      .as(reviewer)
      .post(`/applications/${created.id}/decision`, { decision: 'APPROVE' })
      .expect(200);
    expect(approved.body).toMatchObject({
      status: ApplicationStatus.Approved,
      decidedAt: expect.any(String),
    });

    const audit = await api.as(admin).get(`/applications/${created.id}/audit-logs`).expect(200);
    expect(audit.body.map((entry: { action: string }) => entry.action)).toEqual([
      AuditAction.ApplicationCreated,
      AuditAction.ApplicationUpdated,
      AuditAction.ApplicationSubmitted,
      AuditAction.RiskReviewCompleted,
      AuditAction.ReviewerAssigned,
      AuditAction.DecisionRecorded,
    ]);
  });

  it('supports request-info, edit and resubmission back to the same reviewer', async () => {
    const { sales, admin, reviewer } = ctx.users;
    const application = await api.applicationUnderReview(sales, admin, reviewer);

    await api
      .as(reviewer)
      .post(`/applications/${application.id}/decision`, {
        decision: 'REQUEST_INFO',
        reason: 'Please provide a registered address',
      })
      .expect(200);

    await api
      .as(sales)
      .patch(`/applications/${application.id}`, { businessName: 'Updated Name' })
      .expect(200);
    const resubmitted = await api
      .as(sales)
      .post(`/applications/${application.id}/submit`)
      .expect(200);
    expect(resubmitted.body).toMatchObject({
      status: ApplicationStatus.UnderReview,
      assignedReviewerId: reviewer.id,
      riskStatus: RiskStatus.Pending,
    });

    await api.waitForRiskResult(sales, application.id);
    await api
      .as(reviewer)
      .post(`/applications/${application.id}/decision`, {
        decision: 'REJECT',
        reason: 'Unsupported business model',
      })
      .expect(200);
    expect((await api.getApplication(sales, application.id)).status).toBe(
      ApplicationStatus.Rejected,
    );
  });

  describe('invalid transitions', () => {
    it('cannot edit once submitted', async () => {
      const { sales } = ctx.users;
      const application = await api.createApplication(sales);
      await api.as(sales).post(`/applications/${application.id}/submit`).expect(200);

      await api
        .as(sales)
        .patch(`/applications/${application.id}`, { businessName: 'Too late' })
        .expect(409);
    });

    it('cannot submit twice', async () => {
      const { sales } = ctx.users;
      const application = await api.createApplication(sales);
      await api.as(sales).post(`/applications/${application.id}/submit`).expect(200);
      await api.as(sales).post(`/applications/${application.id}/submit`).expect(409);
    });

    it('cannot assign a draft', async () => {
      const { sales, admin, reviewer } = ctx.users;
      const application = await api.createApplication(sales);
      await api
        .as(admin)
        .post(`/applications/${application.id}/assign`, { reviewerId: reviewer.id })
        .expect(409);
    });

    it('cannot assign a non-reviewer', async () => {
      const { sales, admin } = ctx.users;
      const application = await api.createApplication(sales);
      await api.as(sales).post(`/applications/${application.id}/submit`).expect(200);
      await api
        .as(admin)
        .post(`/applications/${application.id}/assign`, { reviewerId: sales.id })
        .expect(400);
    });

    it('cannot approve before the risk review completes', async () => {
      const { sales, admin, reviewer } = ctx.users;
      ctx.kyb.failuresBeforeSuccess = Number.POSITIVE_INFINITY;
      const application = await api.createApplication(sales);
      await api.as(sales).post(`/applications/${application.id}/submit`).expect(200);
      await api
        .as(admin)
        .post(`/applications/${application.id}/assign`, { reviewerId: reviewer.id })
        .expect(200);

      const response = await api
        .as(reviewer)
        .post(`/applications/${application.id}/decision`, { decision: 'APPROVE' })
        .expect(409);
      expect(response.body.message).toMatch(/risk review/);
    });

    it('cannot decide twice on a terminal application', async () => {
      const { sales, admin, reviewer } = ctx.users;
      const application = await api.applicationUnderReview(sales, admin, reviewer);
      await api
        .as(reviewer)
        .post(`/applications/${application.id}/decision`, { decision: 'APPROVE' })
        .expect(200);
      await api
        .as(reviewer)
        .post(`/applications/${application.id}/decision`, {
          decision: 'REJECT',
          reason: 'Changed my mind',
        })
        .expect(409);
    });

    it('requires a reason when rejecting', async () => {
      const { sales, admin, reviewer } = ctx.users;
      const application = await api.applicationUnderReview(sales, admin, reviewer);
      await api
        .as(reviewer)
        .post(`/applications/${application.id}/decision`, { decision: 'REJECT' })
        .expect(400);
    });
  });

  describe('listing', () => {
    it('filters by status and paginates newest first', async () => {
      const { sales, admin } = ctx.users;
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1)
        ids.push((await api.createApplication(sales, { businessName: `Shop ${i}` })).id);
      await api.as(sales).post(`/applications/${ids[0]}/submit`).expect(200);

      const drafts = await api
        .as(admin)
        .get('/applications?status=DRAFT&page=1&limit=1')
        .expect(200);
      expect(drafts.body.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
      expect(drafts.body.data[0].id).toBe(ids[2]);
    });

    it.each(['limit=0', 'limit=101', 'page=0', 'status=UNKNOWN'])(
      'rejects invalid query %s',
      async (query) => {
        await api.as(ctx.users.admin).get(`/applications?${query}`).expect(400);
      },
    );
  });
});
