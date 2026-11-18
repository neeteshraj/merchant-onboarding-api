import { Injectable } from '@nestjs/common';
import { redact } from '../../common/security/redact.js';
import { TransactionRunner } from '../../database/transaction-runner.js';
import { RiskReviewService } from '../risk/risk-review.service.js';
import type { KybWebhookEventDto, WebhookOutcome } from './dto/kyb-webhook-event.dto.js';
import { KybWebhookEventType } from './enums/kyb-webhook-event-type.enum.js';
import { KybWebhookService } from './kyb-webhook.service.js';
import { WebhookEventRepository } from './repositories/webhook-event.repository.js';

export const KYB_WEBHOOK_PROVIDER = 'simulated-kyb';

@Injectable()
export class KybWebhookServiceImpl extends KybWebhookService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly events: WebhookEventRepository,
    private readonly reviews: RiskReviewService,
  ) {
    super();
  }

  handle(event: KybWebhookEventDto): Promise<WebhookOutcome> {
    return this.transactions.run(async () => {
      const isNew = await this.events.recordIfNew({
        provider: KYB_WEBHOOK_PROVIDER,
        eventId: event.eventId,
        eventType: event.type,
        payload: redact({ ...event }),
      });
      if (!isNew) return 'duplicate';

      const job = { applicationId: event.applicationId, reviewVersion: event.reviewVersion };
      const outcome =
        event.type === KybWebhookEventType.CheckCompleted && event.result
          ? await this.reviews.recordResult(
              job,
              { provider: KYB_WEBHOOK_PROVIDER, ...event.result },
              1,
            )
          : await this.reviews.markFailed(
              job,
              event.failureReason ?? 'Reported failed by provider',
            );

      return outcome === 'applied' ? 'processed' : 'ignored';
    });
  }
}
