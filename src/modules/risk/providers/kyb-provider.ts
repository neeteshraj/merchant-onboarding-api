import type { BusinessType } from '../../applications/enums/business-type.enum.js';
import type { RiskLevel } from '../enums/risk.enum.js';

export interface KybCheckRequest {
  /** Sent to the provider so retried calls return the original result instead of a new check. */
  idempotencyKey: string;
  legalBusinessName: string;
  taxId: string;
  businessType: BusinessType;
  mcc: string;
  expectedMonthlyVolume: number;
}

export interface KybCheckResult {
  provider: string;
  reference: string;
  score: number;
  level: RiskLevel;
  reasons: string[];
}

/** Raised for failures worth retrying (timeouts, 5xx, rate limits). */
export class TransientKybError extends Error {
  override readonly name = 'TransientKybError';
}

/**
 * Port to a third-party Know-Your-Business / risk scoring service. Bound to
 * {@link SimulatedKybProvider} here; a real HTTP client would implement the same contract.
 */
export abstract class KybProvider {
  abstract check(request: KybCheckRequest): Promise<KybCheckResult>;
}
