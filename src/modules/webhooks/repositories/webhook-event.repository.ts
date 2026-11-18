import type { WebhookEvent } from '../entities/webhook-event.entity.js';

export type NewWebhookEvent = Pick<WebhookEvent, 'provider' | 'eventId' | 'eventType' | 'payload'>;

export abstract class WebhookEventRepository {
  /**
   * Atomically records an event unless one with the same `(provider, eventId)` exists.
   * Inside a transaction, a concurrent duplicate blocks until the first commits.
   * @returns `true` if this call recorded the event, `false` if it was already known.
   */
  abstract recordIfNew(event: NewWebhookEvent): Promise<boolean>;
}
