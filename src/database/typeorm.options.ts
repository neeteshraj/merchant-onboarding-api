import type { DataSourceOptions } from 'typeorm';
import { MerchantApplication } from '../modules/applications/entities/merchant-application.entity.js';
import { AuditLog } from '../modules/audit/entities/audit-log.entity.js';
import { RiskAssessment } from '../modules/risk/entities/risk-assessment.entity.js';
import { User } from '../modules/users/entities/user.entity.js';
import { WebhookEvent } from '../modules/webhooks/entities/webhook-event.entity.js';
import { InitialSchema1794982032848 } from './migrations/1794982032848-initial-schema.js';
import { WebhookEvents1794984681920 } from './migrations/1794984681920-webhook-events.js';

export interface DatabaseConnectionSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

/**
 * Shared by the Nest application and the TypeORM CLI so both always agree on
 * entities and migrations. Schema changes go through reviewed migrations only;
 * `synchronize` is never enabled.
 */
export function buildDataSourceOptions(settings: DatabaseConnectionSettings): DataSourceOptions {
  return {
    type: 'postgres',
    ...settings,
    entities: [User, MerchantApplication, RiskAssessment, AuditLog, WebhookEvent],
    migrations: [InitialSchema1794982032848, WebhookEvents1794984681920],
    migrationsTableName: 'schema_migrations',
    synchronize: false,
  };
}
