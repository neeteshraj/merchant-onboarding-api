import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service.js';
import { WebhookSignatureVerifier } from './webhook-signature-verifier.js';

const SIGNATURE_SCHEME = 'v1';
const HEX_SHA256 = /^[a-f0-9]{64}$/;

interface ParsedSignature {
  timestamp: number;
  signatures: string[];
}

function computeSignature(secret: string, timestamp: number, payload: Buffer | string): string {
  return createHmac('sha256', secret).update(`${timestamp}.`).update(payload).digest('hex');
}

/**
 * Builds a signature header value: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`.
 * This is what the provider sends; exported for tests and integration docs.
 */
export function signWebhookPayload(
  secret: string,
  payload: Buffer | string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  return `t=${timestamp},${SIGNATURE_SCHEME}=${computeSignature(secret, timestamp, payload)}`;
}

function parseSignatureHeader(header: string): ParsedSignature | null {
  let timestamp: number | undefined;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.trim().split('=', 2);
    if (key === 't' && value && /^\d+$/.test(value)) timestamp = Number(value);
    else if (key === SIGNATURE_SCHEME && value && HEX_SHA256.test(value)) signatures.push(value);
  }
  return timestamp !== undefined && signatures.length > 0 ? { timestamp, signatures } : null;
}

/**
 * HMAC-SHA256 verifier for `t=…,v1=…` signature headers.
 * - The timestamp is part of the signed content and must be within
 *   `KYB_WEBHOOK_TOLERANCE_SECONDS`, which bounds replay of captured requests.
 * - Several `v1` values are accepted so the provider can rotate secrets.
 * - Comparison is constant-time.
 */
@Injectable()
export class HmacWebhookSignatureVerifier extends WebhookSignatureVerifier {
  constructor(private readonly config: AppConfigService) {
    super();
  }

  verify(payload: Buffer, signatureHeader: string | undefined, nowMs = Date.now()): boolean {
    const parsed = signatureHeader ? parseSignatureHeader(signatureHeader) : null;
    if (!parsed) return false;

    const ageSeconds = Math.abs(nowMs / 1000 - parsed.timestamp);
    if (ageSeconds > this.config.get('KYB_WEBHOOK_TOLERANCE_SECONDS')) return false;

    const expected = Buffer.from(
      computeSignature(this.config.get('KYB_WEBHOOK_SECRET'), parsed.timestamp, payload),
      'hex',
    );
    return parsed.signatures.some((candidate) =>
      timingSafeEqual(expected, Buffer.from(candidate, 'hex')),
    );
  }
}
