import { z } from 'zod';

export const setupStatusSchema = z.object({
  required: z
    .boolean()
    .describe('true while the panel has no admin account and the setup wizard must be completed'),
});

export const completeSetupSchema = z.object({
  setupCode: z
    .string()
    .startsWith('setup_')
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
