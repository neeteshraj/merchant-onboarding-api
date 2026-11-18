import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export enum AuditStore {
  Postgres = 'postgres',
  Mongo = 'mongo',
}

/**
 * Typed, validated view of `process.env`. The application refuses to boot
 * when a required variable is missing or malformed.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  PORT = 3000;

  @IsString()
  DB_HOST: string;

  @Type(() => Number)
  @IsInt()
  DB_PORT = 5432;

  @IsString()
  DB_USER: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_NAME: string;

  @IsString()
  REDIS_HOST: string;

  @Type(() => Number)
  @IsInt()
  REDIS_PORT = 6379;

  /** Namespace for BullMQ keys, letting several environments share one Redis safely. */
  @IsString()
  QUEUE_PREFIX = 'bull';

  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  /** Access token lifetime in seconds. */
  @Type(() => Number)
  @IsInt()
  @Min(60)
  JWT_EXPIRES_IN_SECONDS = 3600;

  /** Maximum attempts for a risk-review job, including the first one. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  RISK_REVIEW_MAX_ATTEMPTS = 5;

  /** Base delay for exponential retry backoff of risk-review jobs. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  RISK_REVIEW_BACKOFF_MS = 1000;

  /** Probability (0–1) that the simulated KYB provider fails transiently. */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  KYB_TRANSIENT_FAILURE_RATE = 0.2;

  /** Shared secret used to verify HMAC signatures on KYB provider callbacks. */
  @IsString()
  @MinLength(32)
  KYB_WEBHOOK_SECRET: string;

  /** Maximum accepted age of a signed callback, limiting replay of captured requests. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  KYB_WEBHOOK_TOLERANCE_SECONDS = 300;

  @IsEnum(AuditStore)
  AUDIT_STORE: AuditStore = AuditStore.Postgres;

  @ValidateIf((env: EnvironmentVariables) => env.AUDIT_STORE === AuditStore.Mongo)
  @IsString()
  MONGO_URL: string;

  @IsString()
  MONGO_DB_NAME = 'merchant_onboarding';
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: false });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return env;
}
