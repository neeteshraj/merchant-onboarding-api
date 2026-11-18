import request from 'supertest';
import { createTestApp, TEST_PASSWORD, type TestContext } from './utils/test-app.js';

describe('Authentication (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(() => ctx.close());

  describe('POST /auth/login', () => {
    it('issues a bearer token for valid credentials', async () => {
      const response = await request(ctx.server)
        .post('/auth/login')
        .send({ email: ctx.users.sales.email, password: TEST_PASSWORD })
        .expect(200);

      expect(response.body).toEqual({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: expect.any(Number),
      });
    });

    it('accepts the email case-insensitively', async () => {
      await request(ctx.server)
        .post('/auth/login')
        .send({ email: ctx.users.sales.email.toUpperCase(), password: TEST_PASSWORD })
        .expect(200);
    });

    it('returns the same 401 for a wrong password and an unknown email', async () => {
      const wrongPassword = await request(ctx.server)
        .post('/auth/login')
        .send({ email: ctx.users.sales.email, password: 'definitely-wrong' })
        .expect(401);
      const unknownEmail = await request(ctx.server)
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'definitely-wrong' })
        .expect(401);

      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });

    it('validates the payload', async () => {
      await request(ctx.server).post('/auth/login').send({ email: 'not-an-email' }).expect(400);
    });

    it('never echoes the password back in errors', async () => {
      const response = await request(ctx.server)
        .post('/auth/login')
        .send({ email: ctx.users.sales.email, password: 'leak-check-password' })
        .expect(401);
      expect(JSON.stringify(response.body)).not.toContain('leak-check-password');
    });
  });

  describe('route protection', () => {
    it('rejects requests without a token', async () => {
      await request(ctx.server).get('/applications').expect(401);
    });

    it.each([
      ['a malformed token', 'Bearer not.a.jwt'],
      ['a non-bearer scheme', 'Basic dXNlcjpwYXNz'],
      ['an empty bearer', 'Bearer '],
    ])('rejects %s', async (_label, header) => {
      await request(ctx.server).get('/applications').set('Authorization', header).expect(401);
    });

    it('rejects a token whose payload was tampered with to escalate role', async () => {
      const [header, , signature] = ctx.users.sales.token.split('.');
      const forged = Buffer.from(
        JSON.stringify({ sub: ctx.users.sales.id, role: 'ADMIN' }),
      ).toString('base64url');
      await request(ctx.server)
        .get('/applications')
        .set('Authorization', `Bearer ${header}.${forged}.${signature}`)
        .expect(401);
    });

    it('accepts a valid token', async () => {
      await request(ctx.server)
        .get('/applications')
        .set('Authorization', `Bearer ${ctx.users.sales.token}`)
        .expect(200);
    });
  });
});
