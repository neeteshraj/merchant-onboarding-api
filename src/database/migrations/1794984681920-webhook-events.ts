import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WebhookEvents1794984681920 implements MigrationInterface {
  name = 'WebhookEvents1794984681920';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webhook_events" (
        "id"         uuid         NOT NULL DEFAULT gen_random_uuid(),
        "provider"   varchar(64)  NOT NULL,
        "event_id"   varchar(128) NOT NULL,
        "event_type" varchar(64)  NOT NULL,
        "payload"    jsonb        NOT NULL,
        "created_at" timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_webhook_events" PRIMARY KEY ("id"),
        CONSTRAINT "uq_webhook_events_provider_event" UNIQUE ("provider", "event_id")
      )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "webhook_events"`);
  }
}
