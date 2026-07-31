import { randomBytes } from 'node:crypto';

const SFTP_PASSWORD_BYTES = 18;

/**
 * SFTP login name for a server: a stable, human-typable handle derived from
 * the server UUID. The daemon's SFTP server maps this back to the server
 * directory and jails the session there.
 */
export function sftpUsername(serverId: string): string {
  return `srv_${serverId.replaceAll('-', '').slice(0, 16)}`;
}

export function generateSftpPassword(): string {
  return randomBytes(SFTP_PASSWORD_BYTES).toString('base64url');
}
