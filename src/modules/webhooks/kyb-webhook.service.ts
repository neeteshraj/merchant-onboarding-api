import type { KybWebhookEventDto, WebhookOutcome } from './dto/kyb-webhook-event.dto.js';

/** Applies KYB provider callbacks to risk reviews. */
export abstract class KybWebhookService {
  /**
   * Processes an authenticated callback exactly once per `eventId`.
   * Recording the event and applying it are atomic: if applying fails, the
   * event is not recorded and the provider's retry will be processed.
   */
  abstract handle(event: KybWebhookEventDto): Promise<WebhookOutcome>;
}
