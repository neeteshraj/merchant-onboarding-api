import { UnauthorizedException } from '@nestjs/common';
import { InMemoryUserRepository } from '../../../test/fakes/in-memory-user.repository.js';
import { Role } from '../users/enums/role.enum.js';
import { AuthServiceImpl } from './auth.service.impl.js';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface.js';
import { PasswordHasher } from './password/password-hasher.js';
import { type IssuedToken, TokenService } from './tokens/token.service.js';

class PlainTextHasher extends PasswordHasher {
  readonly verified: string[] = [];

  async hash(password: string): Promise<string> {
    return `hashed:${password}`;
  }

  async verify(password: string, hash: string): Promise<boolean> {
    this.verified.push(hash);
    return hash === `hashed:${password}`;
  }
}

class StubTokenService extends TokenService {
  readonly issued: AuthenticatedUser[] = [];

  async issue(user: AuthenticatedUser): Promise<IssuedToken> {
    this.issued.push(user);
    return { token: `token-for-${user.id}`, expiresIn: 900 };
  }

  async verify(): Promise<AuthenticatedUser | null> {
    return null;
  }
}

describe('AuthServiceImpl', () => {
  let users: InMemoryUserRepository;
  let hasher: PlainTextHasher;
  let tokens: StubTokenService;
  let service: AuthServiceImpl;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    hasher = new PlainTextHasher();
    tokens = new StubTokenService();
    service = new AuthServiceImpl(users, hasher, tokens);
  });

  it('issues a bearer token carrying the user id and role', async () => {
    const user = users.add(Role.Reviewer, {
      email: 'reviewer@example.com',
      passwordHash: 'hashed:s3cret-pass',
    });

    await expect(service.login('Reviewer@Example.com', 's3cret-pass')).resolves.toEqual({
      accessToken: `token-for-${user.id}`,
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    expect(tokens.issued).toEqual([{ id: user.id, role: Role.Reviewer }]);
  });

  it('rejects a wrong password', async () => {
    users.add(Role.Sales, { email: 'sales@example.com', passwordHash: 'hashed:right' });
    await expect(service.login('sales@example.com', 'wrong')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(tokens.issued).toHaveLength(0);
  });

  it('rejects an unknown email with the same error and still performs a hash check', async () => {
    const error = await service.login('nobody@example.com', 'whatever').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe('Invalid credentials');
    expect(hasher.verified).toHaveLength(1);
  });
});
