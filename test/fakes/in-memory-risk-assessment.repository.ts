import { randomUUID } from 'node:crypto';
import { RiskAssessment } from '../../src/modules/risk/entities/risk-assessment.entity.js';
import {
  type NewRiskAssessment,
  RiskAssessmentRepository,
} from '../../src/modules/risk/repositories/risk-assessment.repository.js';

/** Enforces the same `(applicationId, reviewVersion)` uniqueness as the database constraint. */
export class InMemoryRiskAssessmentRepository extends RiskAssessmentRepository {
  readonly rows: RiskAssessment[] = [];

  async create(data: NewRiskAssessment): Promise<RiskAssessment> {
    const duplicate = this.rows.some(
      (row) => row.applicationId === data.applicationId && row.reviewVersion === data.reviewVersion,
    );
    if (duplicate) throw new Error('unique violation: uq_risk_assessments_application_version');

    const row = Object.assign(new RiskAssessment(), {
      ...data,
      id: randomUUID(),
      createdAt: new Date(),
    });
    this.rows.push(row);
    return row;
  }

  async findByApplication(applicationId: string): Promise<RiskAssessment[]> {
    return this.rows.filter((row) => row.applicationId === applicationId);
  }
}
