import { describe, expect, it } from 'bun:test';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({ email: z.email(), age: z.coerce.number().int().min(0) });
const pipe = new ZodValidationPipe(schema);
const bodyMeta = { type: 'body' } as const;

describe('ZodValidationPipe', () => {
  it('returns parsed data for valid bodies', () => {
    const result = pipe.transform({ email: 'a@b.com', age: '5' }, bodyMeta);
    expect(result).toEqual({ email: 'a@b.com', age: 5 });
  });

  it('throws BadRequestException with field paths for invalid bodies', () => {
    try {
      pipe.transform({ email: 'nope', age: -1 }, bodyMeta);
      throw new Error('expected pipe to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        errors: Array<{ path: string }>;
      };
      expect(response.errors.map((e) => e.path)).toEqual(['email', 'age']);
    }
  });

  it('passes non-body arguments through untouched', () => {
    expect(pipe.transform('raw-param', { type: 'param' })).toBe('raw-param');
  });
});
