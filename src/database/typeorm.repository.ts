import { Injectable } from '@nestjs/common';
import type { EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { TypeOrmTransactionRunner } from './typeorm-transaction-runner.js';

/**
 * Base for TypeORM repository implementations. Resolves the underlying
 * repository per call so that work inside {@link TypeOrmTransactionRunner.run}
 * automatically uses the active transaction.
 */
@Injectable()
export abstract class TypeOrmRepository<T extends ObjectLiteral> {
  protected abstract readonly entity: EntityTarget<T>;

  constructor(private readonly transactions: TypeOrmTransactionRunner) {}

  protected get repository(): Repository<T> {
    return this.transactions.manager.getRepository(this.entity);
  }
}
