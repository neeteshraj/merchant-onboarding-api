import type { AccessTokenDto } from './dto/access-token.dto.js';

export abstract class AuthService {
  /**
   * Exchanges credentials for a signed access token.
   * @throws UnauthorizedException with an identical message for unknown email and wrong password.
   */
  abstract login(email: string, password: string): Promise<AccessTokenDto>;
}
