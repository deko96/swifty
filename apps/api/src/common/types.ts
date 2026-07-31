import type { Request } from 'express';
import type { User } from '../db/schema';

export interface RequestWithId extends Request {
  requestId?: string;
}

export interface AuthenticatedRequest extends RequestWithId {
  user?: User;
}

export const SESSION_COOKIE = 'swifty_session';
