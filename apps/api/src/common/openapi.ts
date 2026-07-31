import type { ApiResponseSchemaHost } from '@nestjs/swagger';
import { type ZodType, z } from 'zod';

type SchemaObject = ApiResponseSchemaHost['schema'];

export function apiSchema(schema: ZodType): SchemaObject {
  return z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
}
