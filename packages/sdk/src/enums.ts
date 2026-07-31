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
 * Host environment requirements probed by the setup wizard before the
 * first admin is created; each check reports pass/fail with a detail line.
 */
export const SetupCheck = {
  DataWrite: 'data_write',
  OutboundHttps: 'outbound_https',
  PortBind: 'port_bind',
  Memory: 'memory',
  Disk: 'disk',
} as const;

export type SetupCheck = (typeof SetupCheck)[keyof typeof SetupCheck];

export const SETUP_CHECK_VALUES = [
  SetupCheck.DataWrite,
  SetupCheck.OutboundHttps,
  SetupCheck.PortBind,
  SetupCheck.Memory,
  SetupCheck.Disk,
] as const;
