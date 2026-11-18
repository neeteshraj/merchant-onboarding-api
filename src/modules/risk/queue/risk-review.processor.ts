import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { type RiskReviewOutcome, RiskReviewService } from '../risk-review.service.js';
import { RISK_REVIEW_QUEUE } from './risk-review-queue.constants.js';
import type { RiskReviewJobData } from './risk-review.queue.js';

/** BullMQ worker for the risk-review queue. Thin adapter over {@link RiskReviewService}. */
@Processor(RISK_REVIEW_QUEUE)
export class RiskReviewProcessor extends WorkerHost {
  private readonly logger = new Logger(RiskReviewProcessor.name);

  constructor(private readonly reviews: RiskReviewService) {
    super();
  }

  process(job: Job<RiskReviewJobData>): Promise<RiskReviewOutcome> {
    return this.reviews.process(job.data, job.attemptsMade + 1);
  }

  /** Records a terminal failure only after the final retry; earlier failures are simply rescheduled. */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<RiskReviewJobData> | undefined, error: Error): Promise<void> {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    this.logger.warn(
      `Risk review ${job.id} attempt ${job.attemptsMade}/${maxAttempts} failed: ${error.message}`,
    );
    if (job.attemptsMade >= maxAttempts) {
      await this.reviews.markFailed(job.data, error.message);
    }
  }
}
