import { randomBytes } from 'node:crypto';
import { testConfig } from '../../../../test/fakes/test-config.js';
import {
  HmacWebhookSignatureVerifier,
  signWebhookPayload,
} from './hmac-webhook-signature-verifier.js';

const SECRET = randomBytes(32).toString('hex');
const NOW_MS = Date.UTC(2026, 10, 18, 12, 0, 0);
const NOW_S = NOW_MS / 1000;
const body = Buffer.from('{"eventId":"evt_12345678","type":"kyb.check.completed"}');

describe('HmacWebhookSignatureVerifier', () => {
  const verifier = new HmacWebhookSignatureVerifier(
    testConfig({ KYB_WEBHOOK_SECRET: SECRET, KYB_WEBHOOK_TOLERANCE_SECONDS: 300 }),
  );

  it('accepts a fresh, correctly signed body', () => {
    expect(verifier.verify(body, signWebhookPayload(SECRET, body, NOW_S), NOW_MS)).toBe(true);
  });

  it('rejects a body modified after signing', () => {
    const header = signWebhookPayload(SECRET, body, NOW_S);
    const tampered = Buffer.from(body.toString().replace('completed', 'failed'));
    expect(verifier.verify(tampered, header, NOW_MS)).toBe(false);
  });

  it('rejects a signature made with another secret', () => {
    const header = signWebhookPayload(randomBytes(32).toString('hex'), body, NOW_S);
    expect(verifier.verify(body, header, NOW_MS)).toBe(false);
  });

  it('rejects a replay of the same signature with a moved timestamp', () => {
    const original = signWebhookPayload(SECRET, body, NOW_S - 1000);
    const replayed = original.replace(`t=${NOW_S - 1000}`, `t=${NOW_S}`);
    expect(verifier.verify(body, replayed, NOW_MS)).toBe(false);
  });

  it.each([
    ['too old', NOW_S - 301],
    ['too far in the future', NOW_S + 301],
  ])('rejects a timestamp %s', (_label, timestamp) => {
    expect(verifier.verify(body, signWebhookPayload(SECRET, body, timestamp), NOW_MS)).toBe(false);
  });

  it('accepts any matching v1 signature, supporting secret rotation', () => {
    const valid = signWebhookPayload(SECRET, body, NOW_S).split(',')[1];
    const header = `t=${NOW_S},v1=${'0'.repeat(64)},${valid}`;
    expect(verifier.verify(body, header, NOW_MS)).toBe(true);
  });

  it.each([
    undefined,
    '',
    'garbage',
    `t=${NOW_S}`,
    `v1=${'a'.repeat(64)}`,
    `t=abc,v1=${'a'.repeat(64)}`,
    `t=${NOW_S},v1=short`,
  ])('rejects malformed header %p', (header) => {
    expect(verifier.verify(body, header, NOW_MS)).toBe(false);
  });
});
