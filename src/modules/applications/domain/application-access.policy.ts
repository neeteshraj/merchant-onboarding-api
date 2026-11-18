import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface.js';
import type { MerchantApplication } from '../entities/merchant-application.entity.js';
import type { ApplicationScope } from '../repositories/merchant-application.repository.js';

export type ApplicationOwnership = Pick<MerchantApplication, 'createdById' | 'assignedReviewerId'>;

/** Object-level authorization rules for merchant applications. */
export abstract class ApplicationAccessPolicy {
  /**
   * Ownership filter applied inside every read, so records outside the
   * caller's scope are indistinguishable from records that do not exist
   * (404, never 403) and IDs cannot be enumerated.
   */
  abstract visibilityScope(user: AuthenticatedUser): ApplicationScope;

  /** Whether the user may edit or submit the application (status rules are checked separately). */
  abstract canModify(user: AuthenticatedUser, application: ApplicationOwnership): boolean;

  /** Whether the user may record a review decision. */
  abstract canDecide(user: AuthenticatedUser, application: ApplicationOwnership): boolean;
}
