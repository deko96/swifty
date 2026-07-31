import { describe, expect, it } from 'bun:test';
import { loadTemplates } from '@swifty/templates';
import { resolveEnv, validateValue } from '../domain/variable-rules';

describe('validateValue', () => {
  it('validates integers and numeric bounds', () => {
    expect(validateValue('integer|between:2,32', '16')).toBeNull();
    expect(validateValue('integer|between:2,32', '33')?.rule).toBe('between');
    expect(validateValue('integer|between:2,32', 'abc')?.rule).toBe('integer');
    expect(validateValue('integer|min:512', '128')?.rule).toBe('min');
  });

  it('validates string length bounds', () => {
    expect(validateValue('string|max:5', 'abc')).toBeNull();
    expect(validateValue('string|max:5', 'abcdef')?.rule).toBe('max');
  });

  it('validates booleans, urls, and membership', () => {
    expect(validateValue('boolean', 'true')).toBeNull();
    expect(validateValue('boolean', 'yes')?.rule).toBe('boolean');
    expect(validateValue('url', 'https://example.com/x.jar')).toBeNull();
    expect(validateValue('url', 'not a url')?.rule).toBe('url');
    expect(validateValue('in:de_dust2,de_inferno', 'de_dust2')).toBeNull();
    expect(validateValue('in:de_dust2,de_inferno', 'cs_office')?.rule).toBe('in');
  });

  it('throws on rules the engine does not support', () => {
    expect(() => validateValue('telepathy', 'x')).toThrow('Unsupported template rule');
  });
});

describe('official templates', () => {
  it('use only supported rules and defaults that pass their own validation', async () => {
    for (const template of await loadTemplates()) {
      const { violations } = resolveEnv(template, {});
      expect(violations).toEqual([]);
    }
  });
});

describe('resolveEnv', () => {
  it('applies defaults, accepts overrides, and reports violations by path', async () => {
    const [cs] = (await loadTemplates()).filter((t) => t.id === 'counter-strike-16');
    if (!cs) throw new Error('counter-strike-16 template missing');

    const ok = resolveEnv(cs, { MAX_PLAYERS: '16' });
    expect(ok.violations).toEqual([]);
    expect(ok.env.MAX_PLAYERS).toBe('16');
    expect(ok.env.DEFAULT_MAP).toBe('de_dust2');

    const bad = resolveEnv(cs, { MAX_PLAYERS: '99', BOGUS: 'x' });
    expect(bad.violations.map((v) => v.path).sort()).toEqual(['env.BOGUS', 'env.MAX_PLAYERS']);
  });
});
