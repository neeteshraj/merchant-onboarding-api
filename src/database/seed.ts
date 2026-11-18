import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ScryptPasswordHasher } from '../modules/auth/password/scrypt-password-hasher.js';
import { User } from '../modules/users/entities/user.entity.js';
import { Role } from '../modules/users/enums/role.enum.js';
import dataSource from './data-source.js';

/** Fictitious demo accounts. All share `SEED_USER_PASSWORD`, which is read from the environment and never committed. */
const DEMO_USERS: ReadonlyArray<Pick<User, 'email' | 'fullName' | 'role'>> = [
  { email: 'admin@example.com', fullName: 'Demo Admin', role: Role.Admin },
  { email: 'reviewer.one@example.com', fullName: 'Demo Reviewer One', role: Role.Reviewer },
  { email: 'reviewer.two@example.com', fullName: 'Demo Reviewer Two', role: Role.Reviewer },
  { email: 'sales.one@example.com', fullName: 'Demo Sales One', role: Role.Sales },
  { email: 'sales.two@example.com', fullName: 'Demo Sales Two', role: Role.Sales },
];

async function seed(): Promise<void> {
  const password = process.env.SEED_USER_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('SEED_USER_PASSWORD must be set (min 12 characters)');
  }

  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
    const passwordHash = await new ScryptPasswordHasher().hash(password);
    await dataSource.getRepository(User).upsert(
      DEMO_USERS.map((user) => ({ ...user, passwordHash })),
      ['email'],
    );
    Logger.log(`Seeded ${DEMO_USERS.length} demo users`, 'Seed');
  } finally {
    await dataSource.destroy();
  }
}

await seed();
