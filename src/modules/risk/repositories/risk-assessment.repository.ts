import type { RiskAssessment } from '../entities/risk-assessment.entity.js';

export type NewRiskAssessment = Omit<RiskAssessment, 'id' | 'createdAt' | 'application'>;

export abstract class RiskAssessmentRepository {
  /** @throws when an assessment for the same application and review version already exists. */
  abstract create(data: NewRiskAssessment): Promise<RiskAssessment>;

  abstract findByApplication(applicationId: string): Promise<RiskAssessment[]>;
}
