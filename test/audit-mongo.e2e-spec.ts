import { AuditAction } from '../src/modules/audit/enums/audit-action.enum.js';
import { AuditLogRepository } from '../src/modules/audit/repositories/audit-log.repository.js';
import {
  AUDIT_LOG_COLLECTION,
  MongoAuditLogRepository,
} from '../src/modules/audit/repositories/mongo-audit-log.repository.js';
import { MongoConnection } from '../src/mongo/mongo-connection.js';
import { ApiClient } from './utils/api-client.js';
import { createTestApp, type TestContext } from './utils/test-app.js';

/** Runs the audit flow with `AUDIT_STORE=mongo` semantics against a real MongoDB. */
describe('Audit trail on MongoDB (e2e)', () => {
  let ctx: TestContext;
  let api: ApiClient;

  const collection = () => ctx.app.get(MongoConnection).db().collection(AUDIT_LOG_COLLECTION);

  beforeAll(async () => {
    ctx = await createTestApp({
      configure: (builder) =>
        builder.overrideProvider(AuditLogRepository).useFactory({
          factory: (mongo: MongoAuditLogRepository) => mongo,
          inject: [MongoAuditLogRepository],
        }),
    });
    api = new ApiClient(ctx.server);
  });

  beforeEach(async () => {
    await ctx.resetApplications();
    await collection().deleteMany({});
  });

  afterAll(async () => {
    await collection()
      .drop()
      .catch(() => undefined);
    await ctx.close();
  });

  it('writes audit entries to MongoDB and serves them through the API', async () => {
    const { sales, admin, reviewer } = ctx.users;
    const application = await api.applicationUnderReview(sales, admin, reviewer);

    const response = await api
      .as(admin)
      .get(`/applications/${application.id}/audit-logs`)
      .expect(200);
    expect(response.body.map((entry: { action: string }) => entry.action)).toEqual([
      AuditAction.ApplicationCreated,
      AuditAction.ApplicationSubmitted,
      AuditAction.RiskReviewCompleted,
      AuditAction.ReviewerAssigned,
    ]);

    expect(await collection().countDocuments({ entityId: application.id })).toBe(4);
    const pgRows: Array<{ count: string }> = await ctx.dataSource.query(
      'SELECT count(*) FROM audit_logs',
    );
    expect(Number(pgRows[0]?.count)).toBe(0);
  });

  it('stores redacted metadata only', async () => {
    const { sales } = ctx.users;
    const application = await api.createApplication(sales);
    await api
      .as(sales)
      .patch(`/applications/${application.id}`, {
        taxId: 'TEST-777777777',
        ownerEmail: 'secret.owner@example.com',
      })
      .expect(200);

    const raw = JSON.stringify(await collection().find({ entityId: application.id }).toArray());
    expect(raw).not.toContain('TEST-777777777');
    expect(raw).not.toContain('secret.owner@example.com');
  });
});
