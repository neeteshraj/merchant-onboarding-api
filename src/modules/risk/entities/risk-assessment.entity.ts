import { Check, Column, Entity, JoinColumn, ManyToOne, type Relation, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { MerchantApplication } from '../../applications/entities/merchant-application.entity.js';
import { RiskLevel } from '../enums/risk.enum.js';

/**
 * Result of one third-party risk/KYB check. The unique constraint on
 * `(application_id, review_version)` is the final idempotency guard: a
 * duplicate job delivery can never persist a second result for the same review.
 */
@Entity({ name: 'risk_assessments' })
@Unique('uq_risk_assessments_application_version', ['applicationId', 'reviewVersion'])
@Check('chk_risk_assessments_score', `"score" BETWEEN 0 AND 100`)
export class RiskAssessment extends BaseEntity {
  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => MerchantApplication, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'application_id',
    foreignKeyConstraintName: 'fk_risk_assessments_application',
  })
  application?: Relation<MerchantApplication>;

  @Column({ name: 'review_version', type: 'int' })
  reviewVersion: number;

  @Column({ type: 'varchar', length: 64 })
  provider: string;

  @Column({ name: 'provider_reference', type: 'varchar', length: 128 })
  providerReference: string;

  @Column({ type: 'smallint' })
  score: number;

  @Column({ type: 'enum', enum: RiskLevel, enumName: 'risk_level' })
  level: RiskLevel;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  reasons: string[];

  /** Number of job attempts it took to obtain this result. */
  @Column({ type: 'smallint' })
  attempts: number;
}
