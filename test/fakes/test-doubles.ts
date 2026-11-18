import { TransactionRunner } from '../../src/database/transaction-runner.js';
import { RiskLevel } from '../../src/modules/risk/enums/risk.enum.js';
import {
  type KybCheckRequest,
  type KybCheckResult,
  KybProvider,
  TransientKybError,
} from '../../src/modules/risk/providers/kyb-provider.js';
import {
  type RiskReviewJobData,
  RiskReviewQueue,
} from '../../src/modules/risk/queue/risk-review.queue.js';

/** Runs work directly; atomicity is covered by the e2e suite against Postgres. */
export class InlineTransactionRunner extends TransactionRunner {
  run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

export class RecordingRiskReviewQueue extends RiskReviewQueue {
  readonly jobs: RiskReviewJobData[] = [];

  async enqueue(job: RiskReviewJobData): Promise<void> {
    this.jobs.push(job);
  }
}

/**
 * KYB provider whose behaviour is scripted per call: fails transiently for the
 * first `failuresBeforeSuccess` calls (or forever when `Infinity`), then
 * returns `result`. {@link hold} keeps calls in flight until released, which
 * lets tests race a webhook against the worker.
 */
export class ScriptedKybProvider extends KybProvider {
  readonly requests: KybCheckRequest[] = [];
  failuresBeforeSuccess = 0;
  result: KybCheckResult = {
    provider: 'scripted-kyb',
    reference: 'ref-test',
    score: 25,
    level: RiskLevel.Low,
    reasons: [],
  };

  private gate?: Promise<void>;
  private releaseGate?: () => void;

  /** Blocks every subsequent `check` until the returned function is called. */
  hold(): () => void {
    this.gate = new Promise((resolve) => {
      this.releaseGate = resolve;
    });
    return () => this.release();
  }

  async check(request: KybCheckRequest): Promise<KybCheckResult> {
    this.requests.push(request);
    await this.gate;
    if (this.requests.length <= this.failuresBeforeSuccess) {
      throw new TransientKybError(`scripted failure #${this.requests.length}`);
    }
    return this.result;
  }

  reset(): void {
    this.release();
    this.requests.length = 0;
    this.failuresBeforeSuccess = 0;
  }

  private release(): void {
    this.releaseGate?.();
    this.gate = undefined;
    this.releaseGate = undefined;
  }
}
