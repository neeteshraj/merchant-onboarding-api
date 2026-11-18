import { ScryptPasswordHasher } from './scrypt-password-hasher.js';

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('verifies the original password', async () => {
    const hash = await hasher.hash('correct horse battery');
    await expect(hasher.verify('correct horse battery', hash)).resolves.toBe(true);
  });

  it('rejects a different password', async () => {
    const hash = await hasher.hash('correct horse battery');
    await expect(hasher.verify('wrong horse battery', hash)).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    const [a, b] = await Promise.all([hasher.hash('same'), hasher.hash('same')]);
    expect(a).not.toBe(b);
  });

  it.each(['', 'no-separator', ':', 'abc:'])('rejects malformed stored hash %p', async (stored) => {
    await expect(hasher.verify('anything', stored)).resolves.toBe(false);
  });
});
