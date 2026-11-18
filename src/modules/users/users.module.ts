import { Module } from '@nestjs/common';
import { TypeOrmUserRepository } from './repositories/typeorm-user.repository.js';
import { UserRepository } from './repositories/user.repository.js';

@Module({
  providers: [{ provide: UserRepository, useClass: TypeOrmUserRepository }],
  exports: [UserRepository],
})
export class UsersModule {}
