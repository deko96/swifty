import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const TOKEN_PREFIX = {
  Session: 'ses',
  ApiKey: 'sk',
  Setup: 'setup',
  Node: 'node',
  NodeJoin: 'join',
} as const;

export type TokenPrefix = (typeof TOKEN_PREFIX)[keyof typeof TOKEN_PREFIX];

export function generateToken(prefix: TokenPrefix): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

export function hasTokenPrefix(token: string, prefix: TokenPrefix): boolean {
  return token.startsWith(`${prefix}_`);
}

const BEARER_SCHEME = 'Bearer ';

/**
 * Extracts a token of the expected kind from an Authorization header;
 * null when the header is absent, not Bearer, or carries another kind.
 */
export function bearerToken(header: string | undefined, prefix: TokenPrefix): string | null {
  if (!header?.startsWith(BEARER_SCHEME)) {
    return null;
  }
  const token = header.slice(BEARER_SCHEME.length);
  return hasTokenPrefix(token, prefix) ? token : null;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * AES-256-GCM for secrets the panel must be able to read back, such as node
 * daemon tokens. Never use this for credentials that only need verification —
 * those are hashed with hashToken.
 */
export function encryptSecret(plain: string, appSecret: string): string {
  const key = createHash('sha256').update(appSecret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(payload: string, appSecret: string): string {
  const [iv, tag, encrypted] = payload.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !encrypted) {
    throw new Error('Malformed encrypted payload');
  }
  const key = createHash('sha256').update(appSecret).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
