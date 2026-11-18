import { Check, Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import { decimalTransformer } from '../../../database/decimal.transformer.js';
import { RiskLevel, RiskStatus } from '../../risk/enums/risk.enum.js';
import { User } from '../../users/entities/user.entity.js';
import { ApplicationStatus } from '../enums/application-status.enum.js';
import { BusinessType } from '../enums/business-type.enum.js';

/**
 * A merchant's request to start processing payments.
 *
 * Fields marked *sensitive* hold PII or regulated identifiers. They are masked
 * in logs, audit records and API responses; see README "Sensitive data" for
 * the field-level encryption plan.
 */
@Entity({ name: 'merchant_applications' })
@Index('idx_merchant_applications_created_by', ['createdById', 'createdAt'])
@Index('idx_merchant_applications_reviewer', ['assignedReviewerId', 'createdAt'])
@Index('idx_merchant_applications_status', ['status', 'createdAt'])
@Check(
  'chk_merchant_applications_amounts',
  `"expected_monthly_volume" >= 0 AND "average_ticket_size" >= 0`,
)
@Check(
  'chk_merchant_applications_risk_score',
  `"risk_score" IS NULL OR "risk_score" BETWEEN 0 AND 100`,
)
@Check(
  'chk_merchant_applications_review_requires_reviewer',
  `"status" NOT IN ('UNDER_REVIEW', 'INFO_REQUESTED', 'APPROVED', 'REJECTED') OR "assigned_reviewer_id" IS NOT NULL`,
)
export class MerchantApplication extends TimestampedEntity {
  @Column({ name: 'business_name', type: 'varchar', length: 200 })
  businessName: string;

  @Column({ name: 'legal_business_name', type: 'varchar', length: 200 })
  legalBusinessName: string;

  @Column({ name: 'business_type', type: 'enum', enum: BusinessType, enumName: 'business_type' })
  businessType: BusinessType;

  /** Sensitive: government-issued tax registration number. */
  @Column({ name: 'tax_id', type: 'varchar', length: 32 })
  taxId: string;

  @Column({ name: 'owner_full_name', type: 'varchar', length: 120 })
  ownerFullName: string;

  /** Sensitive: personal contact detail. */
  @Column({ name: 'owner_email', type: 'varchar', length: 255 })
  ownerEmail: string;

  /** Sensitive: personal contact detail, E.164 format. */
  @Column({ name: 'owner_phone', type: 'varchar', length: 20 })
  ownerPhone: string;

  /** ISO 18245 merchant category code. */
  @Column({ type: 'char', length: 4 })
  mcc: string;

  @Column({
    name: 'expected_monthly_volume',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: decimalTransformer,
  })
  expectedMonthlyVolume: number;

  @Column({
    name: 'average_ticket_size',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  averageTicketSize: number;

  /** ISO 4217 currency code. */
  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({
    type: 'enum',
    enum: ApplicationStatus,
    enumName: 'application_status',
    default: ApplicationStatus.Draft,
  })
  status: ApplicationStatus;

  @Column({
    name: 'risk_status',
    type: 'enum',
    enum: RiskStatus,
    enumName: 'risk_status',
    default: RiskStatus.NotStarted,
  })
  riskStatus: RiskStatus;

  @Column({ name: 'risk_score', type: 'smallint', nullable: true })
  riskScore: number | null;

  @Column({
    name: 'risk_level',
    type: 'enum',
    enum: RiskLevel,
    enumName: 'risk_level',
    nullable: true,
  })
  riskLevel: RiskLevel | null;

  /**
   * Incremented every time a risk review is requested. Jobs carry the version
   * they were created for, so results from superseded reviews are discarded.
   */
  @Column({ name: 'risk_review_version', type: 'int', default: 0 })
  riskReviewVersion: number;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'created_by_id',
    foreignKeyConstraintName: 'fk_merchant_applications_created_by',
  })
  createdBy?: Relation<User>;

  @Column({ name: 'assigned_reviewer_id', type: 'uuid', nullable: true })
  assignedReviewerId: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({
    name: 'assigned_reviewer_id',
    foreignKeyConstraintName: 'fk_merchant_applications_assigned_reviewer',
  })
  assignedReviewer?: Relation<User> | null;

  @Column({ name: 'decision_reason', type: 'text', nullable: true })
  decisionReason: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;
}
