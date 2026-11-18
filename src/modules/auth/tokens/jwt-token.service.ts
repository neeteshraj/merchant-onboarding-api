import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../../../config/app-config.service.js';
import { Role } from '../../users/enums/role.enum.js';
import type { AuthenticatedUser, JwtPayload } from '../interfaces/authenticated-user.interface.js';
import { type IssuedToken, TokenService } from './token.service.js';

const ROLES: ReadonlySet<string> = new Set(Object.values(Role));

function isJwtPayload(value: unknown): value is JwtPayload {
  if (typeof value !== 'object' || value === null) return false;
  const { sub, role } = value as Record<string, unknown>;
  return typeof sub === 'string' && typeof role === 'string' && ROLES.has(role);
}

/** HS256 JWTs signed with `JWT_SECRET`. */
@Injectable()
export class JwtTokenService extends TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {
    super();
  }

  async issue(user: AuthenticatedUser): Promise<IssuedToken> {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    return {
      token: await this.jwt.signAsync(payload),
      expiresIn: this.config.get('JWT_EXPIRES_IN_SECONDS'),
    };
  }

  async verify(token: string): Promise<AuthenticatedUser | null> {
    try {
      const payload: unknown = await this.jwt.verifyAsync(token);
      return isJwtPayload(payload) ? { id: payload.sub, role: payload.role } : null;
    } catch {
      return null;
    }
  }
}
