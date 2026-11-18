import {
  type ApplicationPageQuery,
  type ApplicationScope,
  type FindApplicationOptions,
  MerchantApplicationRepository,
  type NewMerchantApplication,
} from '../../src/modules/applications/repositories/merchant-application.repository.js';
import type { MerchantApplication } from '../../src/modules/applications/entities/merchant-application.entity.js';
import { buildApplication } from '../fixtures/merchant-application.fixture.js';

/** Stores copies so callers cannot mutate persisted state without calling {@link save}. */
export class InMemoryMerchantApplicationRepository extends MerchantApplicationRepository {
  private readonly rows = new Map<string, MerchantApplication>();

  seed(application: MerchantApplication): MerchantApplication {
    this.rows.set(application.id, copy(application));
    return copy(application);
  }

  async create(data: NewMerchantApplication): Promise<MerchantApplication> {
    return this.seed(buildApplication({ ...data }));
  }

  async findById(
    id: string,
    options: FindApplicationOptions = {},
  ): Promise<MerchantApplication | null> {
    const row = this.rows.get(id);
    return row && matches(row, options.scope) ? copy(row) : null;
  }

  async findPage(
    query: ApplicationPageQuery,
  ): Promise<{ items: MerchantApplication[]; total: number }> {
    const filtered = [...this.rows.values()]
      .filter((row) => matches(row, query.scope) && (!query.status || row.status === query.status))
      .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const start = (query.page - 1) * query.limit;
    return { items: filtered.slice(start, start + query.limit).map(copy), total: filtered.length };
  }

  async save(application: MerchantApplication): Promise<MerchantApplication> {
    application.updatedAt = new Date();
    this.rows.set(application.id, copy(application));
    return copy(application);
  }

  get(id: string): MerchantApplication | undefined {
    const row = this.rows.get(id);
    return row && copy(row);
  }
}

function matches(row: MerchantApplication, scope: ApplicationScope = {}): boolean {
  return (
    (!scope.createdById || row.createdById === scope.createdById) &&
    (!scope.assignedReviewerId || row.assignedReviewerId === scope.assignedReviewerId)
  );
}

function copy(row: MerchantApplication): MerchantApplication {
  return buildApplication({ ...row });
}
