export interface RiskReviewJobData {
  applicationId: string;
  reviewVersion: number;
}

/**
 * Producer port for asynchronous risk reviews. Implementations must retry
 * failed reviews and treat repeated enqueues of the same
 * `(applicationId, reviewVersion)` as a single review.
 */
export abstract class RiskReviewQueue {
  abstract enqueue(job: RiskReviewJobData): Promise<void>;
}
