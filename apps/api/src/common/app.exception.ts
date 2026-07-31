import { HttpException } from '@nestjs/common';
import type { ErrorCode, ValidationDetail } from '@swifty/sdk';

export class AppException extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ValidationDetail[],
  ) {
    super(message, status);
  }
}
