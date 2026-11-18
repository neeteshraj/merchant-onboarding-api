import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1794982032848 implements MigrationInterface {
  name = 'InitialSchema1794982032848';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "user_role" AS ENUM ('ADMIN', 'REVIEWER', 'SALES')`);
    await queryRunner.query(
      `CREATE TYPE "business_type" AS ENUM ('SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'NON_PROFIT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "application_status" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "risk_status" AS ENUM ('NOT_STARTED', 'PENDING', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.query(`CREATE TYPE "risk_level" AS ENUM ('LOW', 'MEDIUM', 'HIGH')`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"            uuid         NOT NULL DEFAULT gen_random_uuid(),
        "email"         varchar(255) NOT NULL,
        "full_name"     varchar(120) NOT NULL,
        "role"          "user_role"  NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "created_at"    timestamptz  NOT NULL DEFAULT now(),
        "updated_at"    timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_email" UNIQUE ("email")
      )`);

    await queryRunner.query(`
      CREATE TABLE "merchant_applications" (
        "id"                      uuid                 NOT NULL DEFAULT gen_random_uuid(),
        "business_name"           varchar(200)         NOT NULL,
        "legal_business_name"     varchar(200)         NOT NULL,
        "business_type"           "business_type"      NOT NULL,
        "tax_id"                  varchar(32)          NOT NULL,
        "owner_full_name"         varchar(120)         NOT NULL,
        "owner_email"             varchar(255)         NOT NULL,
        "owner_phone"             varchar(20)          NOT NULL,
        "mcc"                     char(4)              NOT NULL,
        "expected_monthly_volume" numeric(14,2)        NOT NULL,
        "average_ticket_size"     numeric(12,2)        NOT NULL,
        "currency"                char(3)              NOT NULL,
        "status"                  "application_status" NOT NULL DEFAULT 'DRAFT',
        "risk_status"             "risk_status"        NOT NULL DEFAULT 'NOT_STARTED',
        "risk_score"              smallint,
        "risk_level"              "risk_level",
        "risk_review_version"     integer              NOT NULL DEFAULT 0,
        "created_by_id"           uuid                 NOT NULL,
        "assigned_reviewer_id"    uuid,
        "decision_reason"         text,
        "submitted_at"            timestamptz,
        "decided_at"              timestamptz,
        "created_at"              timestamptz          NOT NULL DEFAULT now(),
        "updated_at"              timestamptz          NOT NULL DEFAULT now(),
        CONSTRAINT "pk_merchant_applications" PRIMARY KEY ("id"),
        CONSTRAINT "fk_merchant_applications_created_by" FOREIGN KEY ("created_by_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_merchant_applications_assigned_reviewer" FOREIGN KEY ("assigned_reviewer_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_merchant_applications_amounts"
          CHECK ("expected_monthly_volume" >= 0 AND "average_ticket_size" >= 0),
        CONSTRAINT "chk_merchant_applications_risk_score"
          CHECK ("risk_score" IS NULL OR "risk_score" BETWEEN 0 AND 100),
        CONSTRAINT "chk_merchant_applications_review_requires_reviewer"
          CHECK ("status" NOT IN ('UNDER_REVIEW', 'INFO_REQUESTED', 'APPROVED', 'REJECTED')
                 OR "assigned_reviewer_id" IS NOT NULL)
      )`);
    await queryRunner.query(
      `CREATE INDEX "idx_merchant_applications_created_by" ON "merchant_applications" ("created_by_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_merchant_applications_reviewer" ON "merchant_applications" ("assigned_reviewer_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_merchant_applications_status" ON "merchant_applications" ("status", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "risk_assessments" (
        "id"                 uuid         NOT NULL DEFAULT gen_random_uuid(),
        "application_id"     uuid         NOT NULL,
        "review_version"     integer      NOT NULL,
        "provider"           varchar(64)  NOT NULL,
        "provider_reference" varchar(128) NOT NULL,
        "score"              smallint     NOT NULL,
        "level"              "risk_level" NOT NULL,
        "reasons"            jsonb        NOT NULL DEFAULT '[]'::jsonb,
        "attempts"           smallint     NOT NULL,
        "created_at"         timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_risk_assessments" PRIMARY KEY ("id"),
        CONSTRAINT "uq_risk_assessments_application_version" UNIQUE ("application_id", "review_version"),
        CONSTRAINT "fk_risk_assessments_application" FOREIGN KEY ("application_id")
          REFERENCES "merchant_applications" ("id") ON DELETE CASCADE,
        CONSTRAINT "chk_risk_assessments_score" CHECK ("score" BETWEEN 0 AND 100)
      )`);

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id"          uuid        NOT NULL DEFAULT gen_random_uuid(),
        "actor_id"    uuid,
        "action"      varchar(64) NOT NULL,
        "entity_type" varchar(64) NOT NULL,
        "entity_id"   uuid        NOT NULL,
        "metadata"    jsonb       NOT NULL DEFAULT '{}'::jsonb,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_audit_logs" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_entity" ON "audit_logs" ("entity_type", "entity_id", "created_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TABLE "risk_assessments"`);
    await queryRunner.query(`DROP TABLE "merchant_applications"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "risk_level"`);
    await queryRunner.query(`DROP TYPE "risk_status"`);
    await queryRunner.query(`DROP TYPE "application_status"`);
    await queryRunner.query(`DROP TYPE "business_type"`);
    await queryRunner.query(`DROP TYPE "user_role"`);
  }
}
