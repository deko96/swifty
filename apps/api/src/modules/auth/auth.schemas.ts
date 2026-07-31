import { USER_ROLE_VALUES } from '@swifty/sdk';
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email().describe('Email address of the panel account'),
  password: z.string().min(1).describe('Account password'),
});

export type LoginBody = z.infer<typeof loginSchema>;

export const userResponseSchema = z.object({
  id: z.uuid().describe('Unique identifier of the user'),
  email: z.email(),
  username: z.string(),
  role: z.enum(USER_ROLE_VALUES).describe('admin: full panel access; user: own servers only'),
  createdAt: z.iso.datetime().describe('When the account was created'),
});
