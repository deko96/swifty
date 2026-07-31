import { describe, expect, it } from 'bun:test';
import { decryptSecret, encryptSecret, generateToken, hashToken } from './crypto';

describe('generateToken', () => {
  it('prefixes tokens by kind', () => {
    expect(generateToken('ses')).toStartWith('ses_');
    expect(generateToken('sk')).toStartWith('sk_');
  });

  it('produces unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken('ses')));
    expect(tokens.size).toBe(100);
  });
});

describe('hashToken', () => {
  it('is deterministic and does not leak the token', () => {
    const token = generateToken('sk');
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).toHaveLength(64);
  });
});

describe('encryptSecret / decryptSecret', () => {
  const secret = 'app-secret-app-secret-app-secret';

  it('round-trips a token', () => {
    const token = generateToken('node');
    const encrypted = encryptSecret(token, secret);
    expect(encrypted).not.toContain(token);
    expect(decryptSecret(encrypted, secret)).toBe(token);
  });

  it('produces a different ciphertext each time', () => {
    expect(encryptSecret('same', secret)).not.toBe(encryptSecret('same', secret));
  });

  it('rejects tampered payloads and wrong keys', () => {
    const encrypted = encryptSecret('value', secret);
    expect(() => decryptSecret(encrypted, 'other-secret-other-secret-other!')).toThrow();
    expect(() => decryptSecret(`${encrypted.slice(0, -2)}xx`, secret)).toThrow();
  });
});
