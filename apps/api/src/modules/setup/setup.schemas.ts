import { SETUP_CHECK_VALUES } from '@swifty/sdk';
import { z } from 'zod';
import { TOKEN_PREFIX } from '../../common/crypto';
import { databaseConnectionSchema } from '../../config/panel-config';

export const setupStatusSchema = z.object({
  required: z
    .boolean()
    .describe('true while the panel has no admin account and the setup wizard must be completed'),
  databaseConfigured: z
    .boolean()
    .describe(
      'true when the panel already has a working database, from the environment or from an ' +
        'earlier wizard run; the wizard skips its database step when set',
    ),
});

export const setupCheckSchema = z.object({
  id: z.enum(SETUP_CHECK_VALUES).describe('Which host requirement this result is about'),
  ok: z.boolean().describe('true when the requirement is met'),
  detail: z.string().describe('Human-readable explanation of what was found'),
});

export const setupChecksResponseSchema = z.object({
  ok: z.boolean().describe('true when every requirement is met'),
  checks: z.array(setupCheckSchema).describe('One result per host requirement'),
});

export type SetupCheckResult = z.infer<typeof setupCheckSchema>;
export type SetupChecksResponse = z.infer<typeof setupChecksResponseSchema>;

export const databaseSetupSchema = z.object({
  setupCode: z
    .string()
    .startsWith(`${TOKEN_PREFIX.Setup}_`)
    .describe('One-time code printed in the panel console when it starts unconfigured'),
  database: databaseConnectionSchema.describe(
    'PostgreSQL connection details entered in the wizard',
  ),
});

export type DatabaseSetupBody = z.infer<typeof databaseSetupSchema>;

export const databaseTestResponseSchema = z.object({
  ok: z
    .boolean()
    .describe('true when the database was reached and is ready for the panel to migrate into'),
  version: z.string().nullable().describe('PostgreSQL version string; null if the dial failed'),
  encoding: z
    .string()
    .nullable()
    .describe('Server encoding; the panel requires UTF8. null if the dial failed'),
  canCreate: z
    .boolean()
    .nullable()
    .describe('Whether the database user may create tables; null if the dial failed'),
  error: z.string().nullable().describe('Why the connection failed; null on success'),
});

export type DatabaseTestResponse = z.infer<typeof databaseTestResponseSchema>;

export const completeSetupSchema = z.object({
  setupCode: z
    .string()
    .startsWith(`${TOKEN_PREFIX.Setup}_`)
    .describe('One-time code printed in the panel console when it starts unconfigured'),
  panelName: z.string().min(1).max(64).describe('Display name of this panel, e.g. your brand'),
  admin: z.object({
    email: z.email().describe('Email address for the first administrator account'),
    username: z
      .string()
      .min(3)
      .max(32)
      .regex(/^[a-z0-9][a-z0-9_-]*$/)
      .describe('Lowercase login name for the administrator'),
    password: z
      .string()
      .min(12)
      .max(256)
      .describe('Administrator password, at least 12 characters'),
  }),
});

export type CompleteSetupBody = z.infer<typeof completeSetupSchema>;
