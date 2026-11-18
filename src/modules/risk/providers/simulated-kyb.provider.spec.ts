import { testConfig } from '../../../../test/fakes/test-config.js';
import { BusinessType } from '../../applications/enums/business-type.enum.js';
import { RiskLevel } from '../enums/risk.enum.js';
import type { KybCheckRequest } from './kyb-provider.js';
import { TransientKybError } from './kyb-provider.js';
import { SimulatedKybProvider } from './simulated-kyb.provider.js';

const request: KybCheckRequest = {
  idempotencyKey: 'app-1:v1',
  legalBusinessName: 'Test Coffee House Pvt. Ltd.',
  taxId: 'TEST-123456789',
  businessType: BusinessType.PrivateLimited,
  mcc: '5814',
  expectedMonthlyVolume: 250_000,
};

describe('SimulatedKybProvider', () => {
  const reliable = new SimulatedKybProvider(testConfig({ KYB_TRANSIENT_FAILURE_RATE: 0 }));

  it('is deterministic for the same input', async () => {
    const [a, b] = await Promise.all([reliable.check(request), reliable.check(request)]);
    expect(a).toEqual(b);
  });

  it('derives the provider reference from the idempotency key', async () => {
    const a = await reliable.check(request);
    const b = await reliable.check({ ...request, idempotencyKey: 'app-1:v2' });
    expect(a.reference).not.toBe(b.reference);
  });

  it('flags high-risk categories and volumes', async () => {
    const result = await reliable.check({
      ...request,
      mcc: '7995',
      expectedMonthlyVolume: 50_000_000,
    });
    expect(result.reasons).toEqual(['HIGH_RISK_MCC', 'HIGH_EXPECTED_VOLUME']);
    expect(result.level).toBe(RiskLevel.High);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('fails transiently when configured to', async () => {
    const flaky = new SimulatedKybProvider(testConfig({ KYB_TRANSIENT_FAILURE_RATE: 1 }));
    await expect(flaky.check(request)).rejects.toThrow(TransientKybError);
  });
});
