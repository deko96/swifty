import { describe, expect, it } from 'bun:test';
import { type ArgumentsHost, NotFoundException } from '@nestjs/common';
import type { ApiErrorBody } from '@swifty/sdk';
import { AppException } from '../app.exception';
import { GlobalExceptionFilter } from './global-exception.filter';

function run(exception: unknown): { status: number; body: ApiErrorBody } {
  let status = 0;
  let body: ApiErrorBody | undefined;
  const response = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: ApiErrorBody) {
      body = payload;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ requestId: 'req_test' }),
    }),
  } as unknown as ArgumentsHost;

  new GlobalExceptionFilter().catch(exception, host);
  if (!body) {
    throw new Error('filter did not write a response');
  }
  return { status, body };
}

describe('GlobalExceptionFilter', () => {
  it('serializes AppException with its code, details, and request ID', () => {
    const { status, body } = run(
      new AppException(400, 'validation.failed', 'Validation failed', [
        { path: 'email', message: 'Invalid email address', rule: 'invalid_format' },
      ]),
    );
    expect(status).toBe(400);
    expect(body.code).toBe('validation.failed');
    expect(body.details).toHaveLength(1);
    expect(body.requestId).toBe('req_test');
  });

  it('maps plain Nest HttpExceptions to generic codes by status', () => {
    const { status, body } = run(new NotFoundException('Cannot GET /nope'));
    expect(status).toBe(404);
    expect(body.code).toBe('common.not_found');
    expect(body.message).toBe('Cannot GET /nope');
  });

  it('hides unknown errors behind common.internal', () => {
    const { status, body } = run(new Error('db exploded: password=hunter2'));
    expect(status).toBe(500);
    expect(body.code).toBe('common.internal');
    expect(body.message).not.toContain('hunter2');
  });
});
