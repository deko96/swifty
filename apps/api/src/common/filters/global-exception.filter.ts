import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { ApiErrorBody, ErrorCode } from '@swifty/sdk';
import type { Response } from 'express';
import { AppException } from '../app.exception';
import type { RequestWithId } from '../types';

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'common.bad_request',
  401: 'auth.unauthenticated',
  403: 'auth.forbidden',
  404: 'common.not_found',
  409: 'common.conflict',
  429: 'common.rate_limited',
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const requestId = ctx.getRequest<RequestWithId>().requestId;

    const { status, body } = this.toResponse(exception, requestId);
    if (status >= 500) {
      const stack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`[${requestId}] ${stack}`);
    }
    response.status(status).json(body);
  }

  private toResponse(
    exception: unknown,
    requestId?: string,
  ): { status: number; body: ApiErrorBody } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
          requestId,
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      let message = exception.message;
      if (status === 429) {
        message = 'Too many requests — try again shortly';
      } else if (status >= 500) {
        message = 'Something went wrong on our side';
      }
      return {
        status,
        body: { code: CODE_BY_STATUS[status] ?? 'common.internal', message, requestId },
      };
    }

    return {
      status: 500,
      body: { code: 'common.internal', message: 'Something went wrong on our side', requestId },
    };
  }
}
