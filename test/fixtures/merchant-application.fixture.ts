import { randomUUID } from 'node:crypto';
import type { CreateApplicationDto } from '../../src/modules/applications/dto/create-application.dto.js';
import { MerchantApplication } from '../../src/modules/applications/entities/merchant-application.entity.js';
import { ApplicationStatus } from '../../src/modules/applications/enums/application-status.enum.js';
import { BusinessType } from '../../src/modules/applications/enums/business-type.enum.js';
import { RiskStatus } from '../../src/modules/risk/enums/risk.enum.js';

/** Fictitious application payload; contains no real personal or business data. */
export function applicationPayload(
  overrides: Partial<CreateApplicationDto> = {},
): CreateApplicationDto {
  return {
    businessName: 'Test Coffee House',
    legalBusinessName: 'Test Coffee House Pvt. Ltd.',
    businessType: BusinessType.PrivateLimited,
    taxId: 'TEST-123456789',
    ownerFullName: 'Test Owner',
    ownerEmail: 'owner@example.com',
    ownerPhone: '+9779800000000',
    mcc: '5814',
    expectedMonthlyVolume: 250_000,
    averageTicketSize: 850,
    currency: 'NPR',
    ...overrides,
  };
}

export function buildApplication(
  overrides: Partial<MerchantApplication> = {},
): MerchantApplication {
  const now = new Date();
  return Object.assign(new MerchantApplication(), {
    ...applicationPayload(),
    id: randomUUID(),
    status: ApplicationStatus.Draft,
    riskStatus: RiskStatus.NotStarted,
    riskScore: null,
    riskLevel: null,
    riskReviewVersion: 0,
    createdById: randomUUID(),
    assignedReviewerId: null,
    decisionReason: null,
    submittedAt: null,
    decidedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}
