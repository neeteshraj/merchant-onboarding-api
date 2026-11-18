import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service.js';
import { RiskLevel } from '../enums/risk.enum.js';
import {
  type KybCheckRequest,
  type KybCheckResult,
  KybProvider,
  TransientKybError,
} from './kyb-provider.js';

/** MCCs commonly treated as high risk by acquirers (gambling, dating, telemarketing, crypto). */
const HIGH_RISK_MCCS = new Set(['5967', '5993', '6051', '7273', '7995']);
const HIGH_VOLUME_THRESHOLD = 10_000_000;

/**
 * Deterministic stand-in for a KYB vendor. The same input always yields the
 * same score, which keeps tests stable; transient failures are injected at
 * `KYB_TRANSIENT_FAILURE_RATE` to exercise the retry path.
 */
@Injectable()
export class SimulatedKybProvider extends KybProvider {
  constructor(private readonly config: AppConfigService) {
    super();
  }

  async check(request: KybCheckRequest): Promise<KybCheckResult> {
    await sleep(50);
    if (Math.random() < this.config.get('KYB_TRANSIENT_FAILURE_RATE')) {
      throw new TransientKybError('Simulated KYB provider timeout');
    }

    const digest = createHash('sha256')
      .update(`${request.taxId}|${request.legalBusinessName.toLowerCase()}`)
      .digest();
    const reasons: string[] = [];
    let score = digest.readUInt16BE(0) % 50;

    if (HIGH_RISK_MCCS.has(request.mcc)) {
      score += 35;
      reasons.push('HIGH_RISK_MCC');
    }
    if (request.expectedMonthlyVolume > HIGH_VOLUME_THRESHOLD) {
      score += 15;
      reasons.push('HIGH_EXPECTED_VOLUME');
    }
    score = Math.min(score, 100);

    return {
      provider: 'simulated-kyb',
      reference: `sim_${createHash('sha256').update(request.idempotencyKey).digest('hex').slice(0, 24)}`,
      score,
      level: score >= 70 ? RiskLevel.High : score >= 40 ? RiskLevel.Medium : RiskLevel.Low,
      reasons,
    };
  }
}
