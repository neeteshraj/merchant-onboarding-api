import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AppConfigService } from '../../../config/app-config.service.js';
import {
  RISK_REVIEW_JOB,
  RISK_REVIEW_QUEUE,
  riskReviewJobId,
} from './risk-review-queue.constants.js';
import { type RiskReviewJobData, RiskReviewQueue } from './risk-review.queue.js';

const ONE_DAY_SECONDS = 24 * 60 * 60;

@Injectable()
export class BullMqRiskReviewQueue extends RiskReviewQueue {
  constructor(
    @InjectQueue(RISK_REVIEW_QUEUE) private readonly queue: Queue<RiskReviewJobData>,
    private readonly config: AppConfigService,
  ) {
    super();
  }

  /** Adds a job with exponential-backoff retries and a deterministic id for de-duplication. */
  async enqueue(job: RiskReviewJobData): Promise<void> {
    await this.queue.add(RISK_REVIEW_JOB, job, {
      jobId: riskReviewJobId(job),
      attempts: this.config.get('RISK_REVIEW_MAX_ATTEMPTS'),
      backoff: { type: 'exponential', delay: this.config.get('RISK_REVIEW_BACKOFF_MS') },
      removeOnComplete: { age: ONE_DAY_SECONDS },
      removeOnFail: { age: 7 * ONE_DAY_SECONDS },
    });
  }
}
