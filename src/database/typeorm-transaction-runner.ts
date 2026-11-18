import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { TransactionRunner } from './transaction-runner.js';

/**
 * {@link TransactionRunner} backed by TypeORM. The active transaction's
 * `EntityManager` is kept in `AsyncLocalStorage`, scoped to the async call
 * chain of `run`, and exposed to repositories through {@link manager}.
 */
@Injectable()
export class TypeOrmTransactionRunner extends TransactionRunner {
  private readonly storage = new AsyncLocalStorage<EntityManager>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.storage.getStore()) return work();
    return this.dataSource.transaction((manager) => this.storage.run(manager, work));
  }

  /** The current transaction's manager, or the default (autocommit) manager outside a transaction. */
  get manager(): EntityManager {
    return this.storage.getStore() ?? this.dataSource.manager;
  }
}
