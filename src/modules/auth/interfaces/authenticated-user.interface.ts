import type { Role } from '../../users/enums/role.enum.js';

/** Identity attached to `request.user` once a JWT has been verified. */
export interface AuthenticatedUser {
  id: string;
  role: Role;
}

/** Claims carried inside issued access tokens. */
export interface JwtPayload {
  sub: string;
  role: Role;
}
