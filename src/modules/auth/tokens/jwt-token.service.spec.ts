import { randomBytes } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { testConfig } from '../../../../test/fakes/test-config.js';
import { Role } from '../../users/enums/role.enum.js';
import { JwtTokenService } from './jwt-token.service.js';

const SECRET = randomBytes(32).toString('hex');

function createService(secret = SECRET): JwtTokenService {
  const jwt = new JwtService({ secret, signOptions: { expiresIn: 3600 } });
  return new JwtTokenService(jwt, testConfig({ JWT_EXPIRES_IN_SECONDS: 3600 }));
}

describe('JwtTokenService', () => {
  const service = createService();
  const user = { id: 'user-1', role: Role.Sales };

  it('round-trips the identity through a token', async () => {
    const { token, expiresIn } = await service.issue(user);
    expect(expiresIn).toBe(3600);
    await expect(service.verify(token)).resolves.toEqual(user);
  });

  it('rejects a token signed with another secret', async () => {
    const { token } = await createService(randomBytes(32).toString('hex')).issue(user);
    await expect(service.verify(token)).resolves.toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const { token } = await service.issue(user);
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'user-1', role: Role.Admin })).toString(
      'base64url',
    );
    await expect(service.verify(`${header}.${forged}.${signature}`)).resolves.toBeNull();
  });

  it('rejects a validly signed token carrying an unknown role', async () => {
    const token = await new JwtService({ secret: SECRET }).signAsync({
      sub: 'user-1',
      role: 'ROOT',
    });
    await expect(service.verify(token)).resolves.toBeNull();
  });

  it('rejects garbage', async () => {
    await expect(service.verify('not-a-jwt')).resolves.toBeNull();
  });
});
