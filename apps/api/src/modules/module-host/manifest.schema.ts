import { valid, validRange } from 'semver';
import { z } from 'zod';

const KEBAB_CASE_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Runtime validation of ModuleManifest from @swifty/sdk. Module packages are
 * third-party code: their manifests are untrusted input and must be parsed,
 * not trusted to match the TypeScript interface.
 */
export const manifestSchema = z.object({
  id: z.string().regex(KEBAB_CASE_ID, 'id must be kebab-case'),
  name: z.string().min(1),
  version: z
    .string()
    .refine((value) => valid(value) !== null, { error: 'version must be valid semver' }),
  panelApi: z.string().refine((value) => validRange(value) !== null, {
    error: 'panelApi must be a valid semver range',
  }),
  description: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),
});
