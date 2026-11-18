export const REDACTED = '[REDACTED]';

/** Keys whose values must never leave the process in logs or audit records. */
const SECRET_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'secret',
  'apikey',
  'taxid',
]);

const EMAIL_KEYS = new Set(['email', 'owneremail']);
const PHONE_KEYS = new Set(['phone', 'ownerphone']);

/** `jane.doe@example.com` → `j***@example.com` */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return domain ? `${local.charAt(0)}***@${domain}` : REDACTED;
}

/** Keeps only the last four characters: `+15551234567` → `***4567` */
export function maskTail(value: string, visible = 4): string {
  return value.length <= visible ? '***' : `***${value.slice(-visible)}`;
}

/**
 * Returns a deep copy of `value` with secrets removed and PII masked, matched by
 * key name (case-insensitive). Safe to call on arbitrary request or entity data.
 */
export function redact<T>(value: T): T {
  return redactValue(value, new WeakSet()) as T;
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) return value.map((item) => redactValue(item, seen));
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (SECRET_KEYS.has(normalized)) result[key] = REDACTED;
    else if (EMAIL_KEYS.has(normalized) && typeof field === 'string')
      result[key] = maskEmail(field);
    else if (PHONE_KEYS.has(normalized) && typeof field === 'string') result[key] = maskTail(field);
    else result[key] = redactValue(field, seen);
  }
  return result;
}
