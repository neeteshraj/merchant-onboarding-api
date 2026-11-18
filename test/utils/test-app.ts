import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { ScryptPasswordHasher } from '../../src/modules/auth/password/scrypt-password-hasher.js';
import { KybProvider } from '../../src/modules/risk/providers/kyb-provider.js';
import { RISK_REVIEW_QUEUE } from '../../src/modules/risk/queue/risk-review-queue.constants.js';
import { User } from '../../src/modules/users/entities/user.entity.js';
import { Role } from '../../src/modules/users/enums/role.enum.js';
import { ScriptedKybProvider } from '../fakes/test-doubles.js';

export const TEST_PASSWORD = randomBytes(12).toString('base64url');

export interface TestUser {
  id: string;
  email: string;
  role: Role;
  token: string;
}

export interface TestUsers {
  admin: TestUser;
  sales: TestUser;
  otherSales: TestUser;
  reviewer: TestUser;
  otherReviewer: TestUser;
}

export interface TestContext {
  app: INestApplication;
  server: Server;
  dataSource: DataSource;
  kyb: ScriptedKybProvider;
  users: TestUsers;
  /** Clears applications, risk results and audit logs; users are kept. */
  resetApplications(): Promise<void>;
  close(): Promise<void>;
}

export interface TestAppOptions {
  /** Further provider overrides, e.g. swapping the audit store. */
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/**
 * Boots the full application (real Postgres, Redis and BullMQ worker) with the
 * same global pipeline as production. Only the external KYB vendor is replaced
 * by a scriptable fake.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestContext> {
  const kyb = new ScriptedKybProvider();
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(KybProvider)
    .useValue(kyb);
  const moduleRef = await (options.configure?.(builder) ?? builder).compile();

  const app = moduleRef.createNestApplication({ logger: ['error'], rawBody: true });
  configureApp(app);
  await app.init();

  const server: Server = app.getHttpServer();
  const dataSource = app.get(DataSource);
  const queue = app.get<Queue>(getQueueToken(RISK_REVIEW_QUEUE));
  await queue.obliterate({ force: true });

  await dataSource.query(
    'TRUNCATE webhook_events, audit_logs, risk_assessments, merchant_applications, users CASCADE',
  );
  const users = await seedUsers(server, dataSource);

  return {
    app,
    server,
    dataSource,
    kyb,
    users,
    async resetApplications() {
      await waitForIdleQueue(queue);
      await dataSource.query(
        'TRUNCATE webhook_events, audit_logs, risk_assessments, merchant_applications CASCADE',
      );
      kyb.reset();
    },
    async close() {
      await queue.obliterate({ force: true });
      await app.close();
    },
  };
}

async function seedUsers(server: Server, dataSource: DataSource): Promise<TestUsers> {
  const passwordHash = await new ScryptPasswordHasher().hash(TEST_PASSWORD);
  const create = async (key: keyof TestUsers, role: Role): Promise<TestUser> => {
    const email = `${key.toLowerCase()}@example.com`;
    const user = await dataSource
      .getRepository(User)
      .save({ email, fullName: `Test ${key}`, role, passwordHash });
    const response = await request(server)
      .post('/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    const body: { accessToken: string } = response.body;
    return { id: user.id, email, role, token: body.accessToken };
  };

  return {
    admin: await create('admin', Role.Admin),
    sales: await create('sales', Role.Sales),
    otherSales: await create('otherSales', Role.Sales),
    reviewer: await create('reviewer', Role.Reviewer),
    otherReviewer: await create('otherReviewer', Role.Reviewer),
  };
}

/**
 * Removes pending jobs and waits for in-flight ones to finish, so truncating
 * tables never races a worker transaction from a previous test.
 */
export function waitForIdleQueue(queue: Queue): Promise<true> {
  return waitFor(async () => {
    await queue.drain(true);
    const counts = await queue.getJobCounts('active', 'waiting', 'delayed', 'prioritized');
    return Object.values(counts).every((count) => count === 0) ? true : undefined;
  });
}

/** Polls `probe` until it returns a value, failing after `timeoutMs`. */
export async function waitFor<T>(
  probe: () => Promise<T | undefined>,
  { timeoutMs = 10_000, intervalMs = 50 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}
