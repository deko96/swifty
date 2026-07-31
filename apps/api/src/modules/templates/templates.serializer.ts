import type { GameTemplate } from '@swifty/templates';
import { z } from 'zod';

export const templateResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  supports: z.array(z.string()),
  queryProtocol: z.string(),
  variables: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      default: z.union([z.string(), z.number(), z.boolean()]),
      rules: z.string().describe('Validation rules applied to values, e.g. integer|between:2,32'),
      userEditable: z.boolean(),
    }),
  ),
});

export function toTemplateResponse(template: GameTemplate) {
  return {
    id: template.id,
    name: template.name,
    supports: template.supports,
    queryProtocol: template.query.protocol,
    variables: template.variables.map((variable) => ({
      name: variable.name,
      description: variable.description,
      default: variable.default,
      rules: variable.rules,
      userEditable: variable.user_editable,
    })),
  };
}
