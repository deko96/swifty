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

export const PowerAction = {
  Start: 'start',
  Restart: 'restart',
  Stop: 'stop',
  Kill: 'kill',
} as const;

export type PowerAction = (typeof PowerAction)[keyof typeof PowerAction];

export const POWER_ACTION_VALUES = [
  PowerAction.Start,
  PowerAction.Restart,
  PowerAction.Stop,
  PowerAction.Kill,
] as const;

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

/**
 * Runtime process state reported by the node daemon over the agent channel.
 * Distinct from ServerStatus, which tracks the provisioning/admin lifecycle.
 */
export const ServerPowerState = {
  Offline: 'offline',
  Installing: 'installing',
  Starting: 'starting',
  Running: 'running',
  Stopping: 'stopping',
  Crashed: 'crashed',
} as const;

export type ServerPowerState = (typeof ServerPowerState)[keyof typeof ServerPowerState];

export const SERVER_POWER_STATE_VALUES = [
  ServerPowerState.Offline,
  ServerPowerState.Installing,
  ServerPowerState.Starting,
  ServerPowerState.Running,
  ServerPowerState.Stopping,
  ServerPowerState.Crashed,
] as const;

/**
 * What a one-time token entitles its bearer to do. Issued hashed, spent on
 * first use; a token is only valid for the purpose it was issued for.
 */
export const TokenPurpose = {
  NodeJoin: 'node_join',
} as const;

export type TokenPurpose = (typeof TokenPurpose)[keyof typeof TokenPurpose];

export const TOKEN_PURPOSE_VALUES = [TokenPurpose.NodeJoin] as const;
