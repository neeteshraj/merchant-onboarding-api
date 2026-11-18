import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../../common/dto/pagination.dto.js';
import { maskTail } from '../../../common/security/redact.js';
import { RiskLevel, RiskStatus } from '../../risk/enums/risk.enum.js';
import type { MerchantApplication } from '../entities/merchant-application.entity.js';
import { ApplicationStatus } from '../enums/application-status.enum.js';
import { BusinessType } from '../enums/business-type.enum.js';

export class ApplicationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  businessName: string;

  @ApiProperty()
  legalBusinessName: string;

  @ApiProperty({ enum: BusinessType, enumName: 'BusinessType' })
  businessType: BusinessType;

  @ApiProperty({
    description: 'Masked; only the last four characters are returned',
    example: '***6789',
  })
  taxIdMasked: string;

  @ApiProperty()
  ownerFullName: string;

  @ApiProperty()
  ownerEmail: string;

  @ApiProperty()
  ownerPhone: string;

  @ApiProperty()
  mcc: string;

  @ApiProperty()
  expectedMonthlyVolume: number;

  @ApiProperty()
  averageTicketSize: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ enum: ApplicationStatus, enumName: 'ApplicationStatus' })
  status: ApplicationStatus;

  @ApiProperty({ enum: RiskStatus, enumName: 'RiskStatus' })
  riskStatus: RiskStatus;

  @ApiProperty({ type: Number, nullable: true })
  riskScore: number | null;

  @ApiProperty({ enum: RiskLevel, enumName: 'RiskLevel', nullable: true })
  riskLevel: RiskLevel | null;

  @ApiProperty({ format: 'uuid' })
  createdById: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  assignedReviewerId: string | null;

  @ApiProperty({ type: String, nullable: true })
  decisionReason: string | null;

  @ApiProperty({ type: Date, nullable: true })
  submittedAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  decidedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromEntity(entity: MerchantApplication): ApplicationResponseDto {
    return {
      id: entity.id,
      businessName: entity.businessName,
      legalBusinessName: entity.legalBusinessName,
      businessType: entity.businessType,
      taxIdMasked: maskTail(entity.taxId),
      ownerFullName: entity.ownerFullName,
      ownerEmail: entity.ownerEmail,
      ownerPhone: entity.ownerPhone,
      mcc: entity.mcc,
      expectedMonthlyVolume: entity.expectedMonthlyVolume,
      averageTicketSize: entity.averageTicketSize,
      currency: entity.currency,
      status: entity.status,
      riskStatus: entity.riskStatus,
      riskScore: entity.riskScore,
      riskLevel: entity.riskLevel,
      createdById: entity.createdById,
      assignedReviewerId: entity.assignedReviewerId,
      decisionReason: entity.decisionReason,
      submittedAt: entity.submittedAt,
      decidedAt: entity.decidedAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}

export class ApplicationListResponseDto {
  @ApiProperty({ type: [ApplicationResponseDto] })
  data: ApplicationResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
