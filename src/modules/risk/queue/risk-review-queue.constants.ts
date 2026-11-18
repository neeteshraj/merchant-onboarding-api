import type { RiskReviewJobData } from './risk-review.queue.js';

export const RISK_REVIEW_QUEUE = 'risk-review';
export const RISK_REVIEW_JOB = 'assess-application';

/**
 * Deterministic job id: BullMQ ignores an `add` whose id already exists, so
 * enqueueing the same review twice produces a single job.
 */
export function riskReviewJobId({ applicationId, reviewVersion }: RiskReviewJobData): string {
  return `risk-review-${applicationId}-v${reviewVersion}`;
}
