import { maskEmail, maskTail, REDACTED, redact } from './redact.js';

describe('redact', () => {
  it('removes secrets regardless of key casing', () => {
    expect(
      redact({
        password: 'p',
        PasswordHash: 'h',
        accessToken: 't',
        Authorization: 'Bearer x',
        taxId: 'T-1',
      }),
    ).toEqual({
      password: REDACTED,
      PasswordHash: REDACTED,
      accessToken: REDACTED,
      Authorization: REDACTED,
      taxId: REDACTED,
    });
  });

  it('masks contact details instead of removing them', () => {
    expect(redact({ ownerEmail: 'jane.doe@example.com', ownerPhone: '+9779812345678' })).toEqual({
      ownerEmail: 'j***@example.com',
      ownerPhone: '***5678',
    });
  });

  it('walks nested objects and arrays', () => {
    expect(
      redact({ changes: [{ field: 'x', token: 'abc' }], meta: { user: { email: 'a@b.co' } } }),
    ).toEqual({
      changes: [{ field: 'x', token: REDACTED }],
      meta: { user: { email: 'a***@b.co' } },
    });
  });

  it('leaves non-sensitive values and dates untouched and does not mutate the input', () => {
    const at = new Date('2026-01-01T00:00:00Z');
    const input = { status: 'DRAFT', count: 3, at, password: 'secret' };
    const output = redact(input);
    expect(output).toEqual({ status: 'DRAFT', count: 3, at, password: REDACTED });
    expect(input.password).toBe('secret');
  });

  it('survives circular references', () => {
    const node: Record<string, unknown> = { name: 'n' };
    node.self = node;
    expect(redact(node)).toEqual({ name: 'n', self: '[Circular]' });
  });
});

describe('maskEmail / maskTail', () => {
  it('keeps the first character and domain of an email', () => {
    expect(maskEmail('owner@example.com')).toBe('o***@example.com');
  });

  it('fully redacts a malformed email', () => {
    expect(maskEmail('not-an-email')).toBe(REDACTED);
  });

  it('keeps only the last characters of identifiers', () => {
    expect(maskTail('TEST-123456789')).toBe('***6789');
    expect(maskTail('123')).toBe('***');
  });
});
