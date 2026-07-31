import type { ApiResponseSchemaHost } from '@nestjs/swagger';
import { type ZodType, z } from 'zod';

type SchemaObject = ApiResponseSchemaHost['schema'];

export function apiSchema(schema: ZodType): SchemaObject {
  // unrepresentable 'any': z.date() response fields (serialized as ISO strings)
  // must not crash schema generation at controller-decorator time.
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: 'input',
    unrepresentable: 'any',
  }) as SchemaObject;
}
