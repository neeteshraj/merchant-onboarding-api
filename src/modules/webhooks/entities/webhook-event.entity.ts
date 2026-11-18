import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';

/**
 * Inbound webhook deliveries that have been accepted. The unique constraint on
 * `(provider, event_id)` makes processing exactly-once per event even when the
 * provider retries or delivers concurrently.
 */
@Entity({ name: 'webhook_events' })
@Unique('uq_webhook_events_provider_event', ['provider', 'eventId'])
export class WebhookEvent extends BaseEntity {
  @Column({ type: 'varchar', length: 64 })
  provider: string;

  @Column({ name: 'event_id', type: 'varchar', length: 128 })
  eventId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType: string;

  /** Redacted copy of the delivered payload, for troubleshooting. */
  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;
}
