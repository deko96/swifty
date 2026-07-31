import { ERROR_CODES } from '@swifty/sdk';
import { z } from 'zod';

export const errorResponseSchema = z.object({
  code: z
    .enum(ERROR_CODES)
    .describe('Stable machine-readable error identifier; use this for translations and branching'),
  message: z.string().describe('English description of the error; wording may change'),
  details: z
    .array(
      z.object({
        path: z.string().describe('Which request field is invalid, e.g. admin.email'),
        message: z.string(),
        rule: z.string().describe('The validation rule that failed, e.g. too_small'),
      }),
    )
    .optional()
    .describe('Present on validation.failed: one entry per invalid field'),
  requestId: z
    .string()
    .optional()
    .describe('Correlation ID also returned in the X-Request-Id header; quote it in bug reports'),
});
