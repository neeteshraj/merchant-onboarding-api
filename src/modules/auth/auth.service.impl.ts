import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserRepository } from '../users/repositories/user.repository.js';
import { AuthService } from './auth.service.js';
import type { AccessTokenDto } from './dto/access-token.dto.js';
import { PasswordHasher } from './password/password-hasher.js';
import { TokenService } from './tokens/token.service.js';

@Injectable()
export class AuthServiceImpl extends AuthService {
  /** Verified against when the email is unknown so response time does not reveal account existence. */
  private decoyHash?: Promise<string>;

  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenService,
  ) {
    super();
  }

  async login(email: string, password: string): Promise<AccessTokenDto> {
    const user = await this.users.findByEmailWithPassword(email);
    this.decoyHash ??= this.passwords.hash('decoy-password-for-timing');
    const valid = await this.passwords.verify(
      password,
      user?.passwordHash ?? (await this.decoyHash),
    );
    if (!user || !valid) throw new UnauthorizedException('Invalid credentials');

    const { token, expiresIn } = await this.tokens.issue({ id: user.id, role: user.role });
    return { accessToken: token, tokenType: 'Bearer', expiresIn };
  }
}
