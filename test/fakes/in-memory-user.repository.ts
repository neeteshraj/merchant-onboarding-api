import { randomUUID } from 'node:crypto';
import { User } from '../../src/modules/users/entities/user.entity.js';
import type { Role } from '../../src/modules/users/enums/role.enum.js';
import { UserRepository } from '../../src/modules/users/repositories/user.repository.js';

export class InMemoryUserRepository extends UserRepository {
  private readonly users = new Map<string, User>();

  add(role: Role, overrides: Partial<User> = {}): User {
    const now = new Date();
    const user = Object.assign(new User(), {
      id: randomUUID(),
      email: `${role.toLowerCase()}-${this.users.size}@example.com`,
      fullName: `Test ${role}`,
      role,
      passwordHash: '',
      createdAt: now,
      updatedAt: now,
      ...overrides,
    });
    this.users.set(user.id, user);
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.email === email.toLowerCase()) ?? null;
  }
}
