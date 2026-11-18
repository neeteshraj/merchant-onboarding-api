import type { KybCheckResult } from './providers/kyb-provider.js';
import type { RiskReviewJobData } from './queue/risk-review.queue.js';

/** `applied` when the call changed state; `skipped` when the review was stale or already settled. */
export type RiskReviewOutcome = 'applied' | 'skipped';

/**
 * Risk review use cases, independent of how results arrive (queue worker or
 * provider callback). Implementations must be idempotent: any number of
 * deliveries for the same `(applicationId, reviewVersion)` persist at most one result.
 */
export abstract class RiskReviewService {
  /**
   * Runs the third-party check and persists the result.
   * @param attempt 1-based attempt number, recorded with the result.
   * @throws on provider failure, so the queue can schedule a retry.
   */
  abstract process(job: RiskReviewJobData, attempt: number): Promise<RiskReviewOutcome>;

  /** Persists a provider result obtained elsewhere (e.g. delivered by webhook). */
  abstract recordResult(
    job: RiskReviewJobData,
    result: KybCheckResult,
    attempt: number,
  ): Promise<RiskReviewOutcome>;

  /** Marks the review as failed. No-op if the review was superseded or already settled. */
  abstract markFailed(job: RiskReviewJobData, reason: string): Promise<RiskReviewOutcome>;
}
