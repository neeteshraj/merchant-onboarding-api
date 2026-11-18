import type { MerchantApplication } from '../entities/merchant-application.entity.js';
import type { ApplicationStatus } from '../enums/application-status.enum.js';

/**
 * Ownership constraints narrowing which applications a query may return.
 * An empty scope matches everything.
 */
export interface ApplicationScope {
  createdById?: string;
  assignedReviewerId?: string;
}

export interface ApplicationPageQuery {
  scope: ApplicationScope;
  status?: ApplicationStatus;
  page: number;
  limit: number;
}

export interface FindApplicationOptions {
  scope?: ApplicationScope;
  /** Take an exclusive row lock until the surrounding transaction ends. */
  lock?: boolean;
}

export type NewMerchantApplication = Pick<
  MerchantApplication,
  | 'businessName'
  | 'legalBusinessName'
  | 'businessType'
  | 'taxId'
  | 'ownerFullName'
  | 'ownerEmail'
  | 'ownerPhone'
  | 'mcc'
  | 'expectedMonthlyVolume'
  | 'averageTicketSize'
  | 'currency'
  | 'createdById'
>;

export abstract class MerchantApplicationRepository {
  abstract create(data: NewMerchantApplication): Promise<MerchantApplication>;

  abstract findById(
    id: string,
    options?: FindApplicationOptions,
  ): Promise<MerchantApplication | null>;

  /** Newest first. */
  abstract findPage(
    query: ApplicationPageQuery,
  ): Promise<{ items: MerchantApplication[]; total: number }>;

  abstract save(application: MerchantApplication): Promise<MerchantApplication>;
}
