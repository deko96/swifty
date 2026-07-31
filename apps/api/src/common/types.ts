import type { Request } from 'express';
import type { User } from '../db/schema';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export const SESSION_COOKIE = 'swifty_session';
