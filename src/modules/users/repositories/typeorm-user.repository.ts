import { Injectable } from '@nestjs/common';
import { TypeOrmRepository } from '../../../database/typeorm.repository.js';
import { User } from '../entities/user.entity.js';
import { UserRepository } from './user.repository.js';

@Injectable()
export class TypeOrmUserRepository extends TypeOrmRepository<User> implements UserRepository {
  protected readonly entity = User;

  findById(id: string): Promise<User | null> {
    return this.repository.findOneBy({ id });
  }

  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.repository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: email.toLowerCase() })
      .getOne();
  }
}
