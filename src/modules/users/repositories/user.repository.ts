import type { User } from '../entities/user.entity.js';

export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;

  /** Includes the normally hidden `passwordHash`; use for credential checks only. */
  abstract findByEmailWithPassword(email: string): Promise<User | null>;
}
