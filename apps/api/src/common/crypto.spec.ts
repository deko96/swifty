import { describe, expect, it } from 'bun:test';
import { generateToken, hashToken } from './crypto';

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
