import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppException } from '../app.exception';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'body') {
      return value;
    }
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppException(
        400,
        'validation.failed',
        'Validation failed',
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          rule: issue.code,
        })),
      );
    }
    return result.data;
  }
}
