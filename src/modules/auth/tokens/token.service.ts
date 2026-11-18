import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';

export interface IssuedToken {
  token: string;
  /** Lifetime in seconds. */
  expiresIn: number;
}

/** Issues and verifies access tokens. */
export abstract class TokenService {
  abstract issue(user: AuthenticatedUser): Promise<IssuedToken>;

  /** @returns the identity carried by a valid token, or `null` for any invalid, expired or malformed token. */
  abstract verify(token: string): Promise<AuthenticatedUser | null>;
}
