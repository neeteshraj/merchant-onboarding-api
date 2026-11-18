import { Injectable } from '@nestjs/common';
import { TypeOrmRepository } from '../../../database/typeorm.repository.js';
import { RiskAssessment } from '../entities/risk-assessment.entity.js';
import { type NewRiskAssessment, RiskAssessmentRepository } from './risk-assessment.repository.js';

@Injectable()
export class TypeOrmRiskAssessmentRepository
  extends TypeOrmRepository<RiskAssessment>
  implements RiskAssessmentRepository
{
  protected readonly entity = RiskAssessment;

  create(data: NewRiskAssessment): Promise<RiskAssessment> {
    return this.repository.save(this.repository.create(data));
  }

  findByApplication(applicationId: string): Promise<RiskAssessment[]> {
    return this.repository.find({ where: { applicationId }, order: { reviewVersion: 'ASC' } });
  }
}
