import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface.js';
import { Role } from '../../users/enums/role.enum.js';
import type { ApplicationScope } from '../repositories/merchant-application.repository.js';
import { ApplicationAccessPolicy, type ApplicationOwnership } from './application-access.policy.js';

/**
 * - ADMIN: sees and modifies everything; reassigns rather than decides.
 * - SALES: sees and modifies only applications they created.
 * - REVIEWER: sees only applications assigned to them and is the only role that can decide.
 */
@Injectable()
export class RoleBasedApplicationAccessPolicy extends ApplicationAccessPolicy {
  visibilityScope(user: AuthenticatedUser): ApplicationScope {
    switch (user.role) {
      case Role.Admin:
        return {};
      case Role.Sales:
        return { createdById: user.id };
      case Role.Reviewer:
        return { assignedReviewerId: user.id };
    }
  }

  canModify(user: AuthenticatedUser, application: ApplicationOwnership): boolean {
    return (
      user.role === Role.Admin || (user.role === Role.Sales && application.createdById === user.id)
    );
  }

  canDecide(user: AuthenticatedUser, application: ApplicationOwnership): boolean {
    return user.role === Role.Reviewer && application.assignedReviewerId === user.id;
  }
}
