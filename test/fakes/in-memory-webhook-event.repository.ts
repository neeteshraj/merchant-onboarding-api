import {
  type NewWebhookEvent,
  WebhookEventRepository,
} from '../../src/modules/webhooks/repositories/webhook-event.repository.js';

export class InMemoryWebhookEventRepository extends WebhookEventRepository {
  readonly events: NewWebhookEvent[] = [];

  async recordIfNew(event: NewWebhookEvent): Promise<boolean> {
    const exists = this.events.some(
      (known) => known.provider === event.provider && known.eventId === event.eventId,
    );
    if (exists) return false;
    this.events.push(event);
    return true;
  }
}
