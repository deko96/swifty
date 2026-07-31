import type { Response } from 'express';
import { SESSION_COOKIE } from './types';

export function setSessionCookie(
  response: Response,
  token: string,
  options: { secure: boolean; maxAge: number },
): void {
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: options.secure,
    maxAge: options.maxAge,
    path: '/',
  });
}
