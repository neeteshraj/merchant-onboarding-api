import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from '../../../database/base.entity.js';
import { Role } from '../enums/role.enum.js';

@Entity({ name: 'users' })
export class User extends TimestampedEntity {
  /** Always stored lower-cased; uniqueness is enforced by the database. */
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ name: 'full_name', type: 'varchar', length: 120 })
  fullName: string;

  @Column({ type: 'enum', enum: Role, enumName: 'user_role' })
  role: Role;

  /** Excluded from every query unless explicitly selected. */
  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash: string;
}
