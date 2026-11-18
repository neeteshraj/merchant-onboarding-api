import { Injectable } from '@nestjs/common';
import { TypeOrmRepository } from '../../../database/typeorm.repository.js';
import { WebhookEvent } from '../entities/webhook-event.entity.js';
import { type NewWebhookEvent, WebhookEventRepository } from './webhook-event.repository.js';

@Injectable()
export class TypeOrmWebhookEventRepository
  extends TypeOrmRepository<WebhookEvent>
  implements WebhookEventRepository
{
  protected readonly entity = WebhookEvent;

  /** A returned row means this call inserted the event; a conflict returns none. */
  async recordIfNew(event: NewWebhookEvent): Promise<boolean> {
    const rows: Array<{ id: string }> = await this.repository.query(
      `INSERT INTO "webhook_events" ("provider", "event_id", "event_type", "payload")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ON CONSTRAINT "uq_webhook_events_provider_event" DO NOTHING
       RETURNING "id"`,
      [event.provider, event.eventId, event.eventType, JSON.stringify(event.payload)],
    );
    return rows.length > 0;
  }
}
