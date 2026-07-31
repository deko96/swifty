import { createHash, randomBytes } from 'node:crypto';

export type TokenPrefix = 'ses' | 'sk' | 'setup';

export function generateToken(prefix: TokenPrefix): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
