import type { PaginationMetaDto } from '../../common/dto/pagination.dto.js';
import type { AuditLog } from '../audit/entities/audit-log.entity.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import type { CreateApplicationDto } from './dto/create-application.dto.js';
import type { ListApplicationsQueryDto } from './dto/list-applications-query.dto.js';
import type { RecordDecisionDto } from './dto/record-decision.dto.js';
import type { UpdateApplicationDto } from './dto/update-application.dto.js';
import type { MerchantApplication } from './entities/merchant-application.entity.js';

export interface Page<T> {
  data: T[];
  meta: PaginationMetaDto;
}

/**
 * Merchant application lifecycle use cases. Every method enforces
 * object-level authorization for `actor`; applications outside the actor's
 * visibility scope surface as `NotFoundException`.
 */
export abstract class ApplicationsService {
  abstract create(
    dto: CreateApplicationDto,
    actor: AuthenticatedUser,
  ): Promise<MerchantApplication>;

  /** Applications within the actor's visibility scope, newest first. */
  abstract list(
    query: ListApplicationsQueryDto,
    actor: AuthenticatedUser,
  ): Promise<Page<MerchantApplication>>;

  abstract findOne(id: string, actor: AuthenticatedUser): Promise<MerchantApplication>;

  /** @throws ForbiddenException for non-owners, ConflictException outside editable statuses. */
  abstract update(
    id: string,
    dto: UpdateApplicationDto,
    actor: AuthenticatedUser,
  ): Promise<MerchantApplication>;

  /** Submits or resubmits the application and enqueues an asynchronous risk review. */
  abstract submit(id: string, actor: AuthenticatedUser): Promise<MerchantApplication>;

  /** @throws BadRequestException when `reviewerId` is not an existing REVIEWER. */
  abstract assignReviewer(
    id: string,
    reviewerId: string,
    actor: AuthenticatedUser,
  ): Promise<MerchantApplication>;

  /** @throws ForbiddenException unless the actor is the assigned reviewer. */
  abstract recordDecision(
    id: string,
    dto: RecordDecisionDto,
    actor: AuthenticatedUser,
  ): Promise<MerchantApplication>;

  /** Starts a new risk review after a failed or lost one. */
  abstract requeueRiskReview(id: string, actor: AuthenticatedUser): Promise<MerchantApplication>;

  abstract auditTrail(id: string, actor: AuthenticatedUser): Promise<AuditLog[]>;
}
