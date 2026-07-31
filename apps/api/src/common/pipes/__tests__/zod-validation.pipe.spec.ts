import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { AppException } from '../../app.exception';
import { ZodValidationPipe } from '../zod-validation.pipe';

const schema = z.object({ email: z.email(), age: z.coerce.number().int().min(0) });
const pipe = new ZodValidationPipe(schema);
const bodyMeta = { type: 'body' } as const;

describe('ZodValidationPipe', () => {
  it('returns parsed data for valid bodies', () => {
    const result = pipe.transform({ email: 'a@b.com', age: '5' }, bodyMeta);
    expect(result).toEqual({ email: 'a@b.com', age: 5 });
  });

  it('throws a coded validation error listing each invalid field', () => {
    try {
      pipe.transform({ email: 'nope', age: -1 }, bodyMeta);
      throw new Error('expected pipe to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      const exception = error as AppException;
      expect(exception.getStatus()).toBe(400);
      expect(exception.code).toBe('validation.failed');
      expect(exception.details?.map((d) => d.path)).toEqual(['email', 'age']);
      for (const detail of exception.details ?? []) {
        expect(detail.rule.length).toBeGreaterThan(0);
      }
    }
  });

  it('passes non-body arguments through untouched', () => {
    expect(pipe.transform('raw-param', { type: 'param' })).toBe('raw-param');
  });
});
