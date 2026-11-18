/**
 * Runs a unit of work atomically. Repositories invoked inside `work` join the
 * same transaction implicitly, so services never pass connection handles around.
 * Nested calls reuse the outer transaction.
 */
export abstract class TransactionRunner {
  abstract run<T>(work: () => Promise<T>): Promise<T>;
}
