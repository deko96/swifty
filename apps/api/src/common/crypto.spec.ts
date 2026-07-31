import { describe, expect, it } from 'bun:test';
import { decryptSecret, encryptSecret, generateToken, hashToken, TOKEN_PREFIX } from './crypto';

describe('generateToken', () => {
  it('prefixes tokens by kind', () => {
    expect(generateToken(TOKEN_PREFIX.Session)).toStartWith(`${TOKEN_PREFIX.Session}_`);
    expect(generateToken(TOKEN_PREFIX.ApiKey)).toStartWith(`${TOKEN_PREFIX.ApiKey}_`);
  });

  it('produces unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken(TOKEN_PREFIX.Session)));
    expect(tokens.size).toBe(100);
  });
});

describe('hashToken', () => {
  it('is deterministic and does not leak the token', () => {
    const token = generateToken(TOKEN_PREFIX.ApiKey);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).toHaveLength(64);
  });
});

describe('encryptSecret / decryptSecret', () => {
  const secret = 'app-secret-app-secret-app-secret';

  it('round-trips a token', () => {
    const token = generateToken(TOKEN_PREFIX.Node);
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
