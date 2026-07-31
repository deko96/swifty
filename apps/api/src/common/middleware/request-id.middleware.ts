import { randomBytes } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { RequestWithId } from '../types';

const INBOUND_ID = /^[A-Za-z0-9_-]{1,64}$/;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const inbound = request.headers['x-request-id'];
    request.requestId =
      typeof inbound === 'string' && INBOUND_ID.test(inbound)
        ? inbound
        : `req_${randomBytes(8).toString('hex')}`;
    response.setHeader('X-Request-Id', request.requestId);
    next();
  }
}
