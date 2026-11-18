import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

/**
 * E2E environment: reuses the local `.env` connection settings (or CI-provided
 * variables) but always targets dedicated `_test` databases (Postgres and
 * Mongo) and an isolated BullMQ prefix, so tests never touch development data or workers.
 */
if (existsSync('.env')) process.loadEnvFile('.env');

process.env.NODE_ENV = 'test';
process.env.DB_NAME = `${process.env.DB_NAME ?? 'merchant_onboarding'}_test`;
process.env.QUEUE_PREFIX = 'e2e';
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.KYB_WEBHOOK_SECRET = randomBytes(32).toString('hex');
process.env.MONGO_DB_NAME = `${process.env.MONGO_DB_NAME ?? 'merchant_onboarding'}_test`;
process.env.AUDIT_STORE = 'postgres';
process.env.RISK_REVIEW_MAX_ATTEMPTS = '3';
process.env.RISK_REVIEW_BACKOFF_MS = '20';
