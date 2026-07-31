import { USER_ROLE_VALUES, UserRole } from '@swifty/sdk';
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.email().describe('Email address; must be unique'),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9][a-z0-9_-]*$/)
    .describe('Lowercase login name; must be unique'),
  password: z.string().min(12).max(256).describe('Initial password, at least 12 characters'),
  role: z.enum(USER_ROLE_VALUES).default(UserRole.User).describe('Panel-wide role of the account'),
});

export type CreateUserBody = z.infer<typeof createUserSchema>;
