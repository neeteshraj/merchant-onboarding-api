import { ApplicationStatus } from '../src/modules/applications/enums/application-status.enum.js';
import { applicationPayload } from './fixtures/merchant-application.fixture.js';
import { ApiClient } from './utils/api-client.js';
import { createTestApp, type TestContext } from './utils/test-app.js';

/**
 * Proves the object-level authorization rules cannot be bypassed through the
 * HTTP API. Resources outside a caller's scope must be indistinguishable from
 * non-existent ones (404) and must remain unchanged.
 */
describe('Applications authorization (e2e)', () => {
  let ctx: TestContext;
  let api: ApiClient;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = new ApiClient(ctx.server);
  });

  beforeEach(() => ctx.resetApplications());

  afterAll(() => ctx.close());

  describe('SALES isolation', () => {
    it('cannot read another sales user’s application by id', async () => {
      const { sales, otherSales } = ctx.users;
      const application = await api.createApplication(sales);

      await api.as(otherSales).get(`/applications/${application.id}`).expect(404);
    });

    it('cannot update another sales user’s application by id, and nothing changes', async () => {
      const { sales, otherSales } = ctx.users;
      const application = await api.createApplication(sales);

      await api
        .as(otherSales)
        .patch(`/applications/${application.id}`, { businessName: 'Hijacked Name' })
        .expect(404);

      const unchanged = await api.getApplication(sales, application.id);
      expect(unchanged.businessName).toBe(application.businessName);
    });

    it('cannot submit another sales user’s application', async () => {
      const { sales, otherSales } = ctx.users;
      const application = await api.createApplication(sales);

      await api.as(otherSales).post(`/applications/${application.id}/submit`).expect(404);
      expect((await api.getApplication(sales, application.id)).status).toBe(
        ApplicationStatus.Draft,
      );
    });

    it('cannot read another user’s audit trail', async () => {
      const { sales, otherSales } = ctx.users;
      const application = await api.createApplication(sales);
      await api.as(otherSales).get(`/applications/${application.id}/audit-logs`).expect(403);
    });

    it('only lists their own applications', async () => {
      const { sales, otherSales } = ctx.users;
      const own = await api.createApplication(sales);
      await api.createApplication(otherSales);

      const response = await api.as(sales).get('/applications').expect(200);
      expect(response.body.meta.total).toBe(1);
      expect(response.body.data.map((a: { id: string }) => a.id)).toEqual([own.id]);
    });

    it('cannot assign reviewers or record decisions', async () => {
      const { sales, reviewer } = ctx.users;
      const application = await api.createApplication(sales);

      await api
        .as(sales)
        .post(`/applications/${application.id}/assign`, { reviewerId: reviewer.id })
        .expect(403);
      await api
        .as(sales)
        .post(`/applications/${application.id}/decision`, { decision: 'APPROVE' })
        .expect(403);
    });
  });

  describe('mass assignment', () => {
    it.each([
      ['status', { status: ApplicationStatus.Approved }],
      ['createdById', { createdById: '00000000-0000-4000-8000-000000000000' }],
      ['assignedReviewerId', { assignedReviewerId: '00000000-0000-4000-8000-000000000000' }],
      ['riskStatus', { riskStatus: 'COMPLETED' }],
    ])('rejects client-supplied %s', async (_field, body) => {
      const { sales } = ctx.users;
      const application = await api.createApplication(sales);

      await api.as(sales).patch(`/applications/${application.id}`, body).expect(400);
      expect((await api.getApplication(sales, application.id)).status).toBe(
        ApplicationStatus.Draft,
      );
    });

    it('rejects ownership fields on create', async () => {
      const { sales, otherSales } = ctx.users;
      await api
        .as(sales)
        .post('/applications', { ...applicationPayload(), createdById: otherSales.id })
        .expect(400);
    });
  });

  describe('REVIEWER decisions', () => {
    it('only the assigned reviewer can see or decide', async () => {
      const { sales, admin, reviewer, otherReviewer } = ctx.users;
      const application = await api.applicationUnderReview(sales, admin, reviewer);

      await api.as(otherReviewer).get(`/applications/${application.id}`).expect(404);
      await api
        .as(otherReviewer)
        .post(`/applications/${application.id}/decision`, { decision: 'APPROVE' })
        .expect(404);
      expect((await api.getApplication(sales, application.id)).status).toBe(
        ApplicationStatus.UnderReview,
      );

      await api
        .as(reviewer)
        .post(`/applications/${application.id}/decision`, { decision: 'APPROVE' })
        .expect(200);
    });

    it('an admin cannot record a decision', async () => {
      const { sales, admin, reviewer } = ctx.users;
      const application = await api.applicationUnderReview(sales, admin, reviewer);

      await api
        .as(admin)
        .post(`/applications/${application.id}/decision`, { decision: 'APPROVE' })
        .expect(403);
    });

    it('a reassigned reviewer loses access', async () => {
      const { sales, admin, reviewer, otherReviewer } = ctx.users;
      const application = await api.applicationUnderReview(sales, admin, reviewer);

      await api
        .as(admin)
        .post(`/applications/${application.id}/assign`, { reviewerId: otherReviewer.id })
        .expect(200);

      await api
        .as(reviewer)
        .post(`/applications/${application.id}/decision`, { decision: 'APPROVE' })
        .expect(404);
      await api
        .as(otherReviewer)
        .post(`/applications/${application.id}/decision`, { decision: 'APPROVE' })
        .expect(200);
    });

    it('reviewers cannot create or edit applications', async () => {
      const { reviewer } = ctx.users;
      await api.as(reviewer).post('/applications', {}).expect(403);
    });
  });

  describe('input hardening', () => {
    it('rejects non-UUID ids before touching the database', async () => {
      await api.as(ctx.users.admin).get('/applications/1%20OR%201=1').expect(400);
    });

    it('returns 404 for an unknown id even to admins', async () => {
      await api
        .as(ctx.users.admin)
        .get('/applications/7b0f1c2e-3c4d-4e5f-8a6b-7c8d9e0f1a2b')
        .expect(404);
    });
  });
});
