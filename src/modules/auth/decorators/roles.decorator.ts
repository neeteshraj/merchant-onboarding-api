import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../users/enums/role.enum.js';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given roles. Coarse-grained only: object-level
 * rules (ownership, assignment) are enforced in the domain layer.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
