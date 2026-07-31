/**
 * Enumerations shared across the panel API, UIs, and modules. Database
 * enums and zod schemas derive from these values — they are the single
 * source of truth, never repeat the literals.
 */

export const UserRole = {
  Admin: 'admin',
  User: 'user',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const USER_ROLE_VALUES = [UserRole.Admin, UserRole.User] as const;

export const ServerStatus = {
  Installing: 'installing',
  Installed: 'installed',
  InstallFailed: 'install_failed',
  Suspended: 'suspended',
} as const;

export type ServerStatus = (typeof ServerStatus)[keyof typeof ServerStatus];

export const SERVER_STATUS_VALUES = [
  ServerStatus.Installing,
  ServerStatus.Installed,
  ServerStatus.InstallFailed,
  ServerStatus.Suspended,
] as const;
