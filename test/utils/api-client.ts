import type { Server } from 'node:http';
import request from 'supertest';
import type { ApplicationResponseDto } from '../../src/modules/applications/dto/application-response.dto.js';
import type { CreateApplicationDto } from '../../src/modules/applications/dto/create-application.dto.js';
import { RiskStatus } from '../../src/modules/risk/enums/risk.enum.js';
import { applicationPayload } from '../fixtures/merchant-application.fixture.js';
import { type TestUser, waitFor } from './test-app.js';

/** Thin typed wrapper over Supertest for the applications API. */
export class ApiClient {
  constructor(private readonly server: Server) {}

  as(user: TestUser) {
    const auth = { Authorization: `Bearer ${user.token}` };
    const http = () => request(this.server);
    return {
      get: (path: string) => http().get(path).set(auth),
      post: (path: string, body?: object) => http().post(path).set(auth).send(body),
      patch: (path: string, body: object) => http().patch(path).set(auth).send(body),
    };
  }

  async createApplication(
    owner: TestUser,
    overrides: Partial<CreateApplicationDto> = {},
  ): Promise<ApplicationResponseDto> {
    const response = await this.as(owner)
      .post('/applications', applicationPayload(overrides))
      .expect(201);
    return response.body;
  }

  async getApplication(user: TestUser, id: string): Promise<ApplicationResponseDto> {
    const response = await this.as(user).get(`/applications/${id}`).expect(200);
    return response.body;
  }

  /** Waits until the background worker moves the risk review out of PENDING. */
  waitForRiskResult(user: TestUser, id: string): Promise<ApplicationResponseDto> {
    return waitFor(async () => {
      const application = await this.getApplication(user, id);
      return application.riskStatus === RiskStatus.Pending ? undefined : application;
    });
  }

  /** Creates, submits, waits for risk completion and assigns `reviewer`. */
  async applicationUnderReview(owner: TestUser, admin: TestUser, reviewer: TestUser) {
    const created = await this.createApplication(owner);
    await this.as(owner).post(`/applications/${created.id}/submit`).expect(200);
    await this.waitForRiskResult(owner, created.id);
    const response = await this.as(admin)
      .post(`/applications/${created.id}/assign`, { reviewerId: reviewer.id })
      .expect(200);
    const application: ApplicationResponseDto = response.body;
    return application;
  }
}
