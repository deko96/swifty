import type { PowerAction, ServerPowerState } from './enums';

/**
 * Panel ⇄ daemon agent channel protocol.
 *
 * The daemon dials the panel over a persistent WebSocket and both sides
 * exchange JSON messages in an `{ event, data }` envelope. `data` always
 * carries the protocol version and a message id; a `result` event answers
 * the command whose id it references. The protocol is additive: new event
 * types may appear within a version, so receivers must ignore unknown
 * events rather than fail.
 *
 * The Go daemon mirrors these shapes in `daemon/internal/agent`; the JSON
 * fixtures under `packages/sdk/fixtures/agent` pin both sides to the same
 * wire format.
 */
export const AGENT_PROTOCOL_VERSION = 1;

/** Fields present on every message's `data`. */
export interface AgentMeta {
  v: number;
  id: string;
}

/** Per-server resource ceilings enforced by the daemon's supervisor. */
export interface ResourceLimits {
  cpuPercent: number;
  memoryMiB: number;
  diskMiB: number;
  pids: number;
}

/**
 * One server's desired state, pushed in `sync` whenever the channel
 * (re)connects so the daemon can reconcile after a panel outage.
 */
export interface DesiredServer {
  serverId: string;
  autostart: boolean;
  suspended: boolean;
}

export interface HardwareInventory {
  hostname: string;
  os: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  memoryMiB: number;
  diskMiB: number;
}

export const PortProtocol = {
  Tcp: 'tcp',
  Udp: 'udp',
} as const;

export type PortProtocol = (typeof PortProtocol)[keyof typeof PortProtocol];

export const PORT_PROTOCOL_VALUES = [PortProtocol.Tcp, PortProtocol.Udp] as const;

/** Result of the daemon probing one of its own ports during hello. */
export interface PortProbe {
  protocol: PortProtocol;
  port: number;
  open: boolean;
}

/** Commands: panel → daemon. */
export interface AgentCommandMap {
  power: {
    serverId: string;
    action: PowerAction;
    command?: string[];
    env?: Record<string, string>;
    limits?: ResourceLimits;
  };
  install: {
    serverId: string;
    script: string;
    env?: Record<string, string>;
  };
  sync: {
    servers: DesiredServer[];
  };
}

/** Events: daemon → panel. */
export interface AgentEventMap {
  hello: {
    protocol: number;
    daemonVersion: string;
    inventory: HardwareInventory;
    ports: PortProbe[];
  };
  state: {
    serverId: string;
    state: ServerPowerState;
    exitCode?: number;
  };
  'install.progress': {
    serverId: string;
    line: string;
  };
  result: {
    commandId: string;
    ok: boolean;
    error?: string;
    output?: string;
  };
}

export type AgentCommandName = keyof AgentCommandMap;
export type AgentEventName = keyof AgentEventMap;

/** Runtime command names, for dispatching without string literals. */
export const AgentCommands = {
  Power: 'power',
  Install: 'install',
  Sync: 'sync',
} as const satisfies Record<string, AgentCommandName>;

/** Runtime event names, for dispatching without string literals. */
export const AgentEvents = {
  Hello: 'hello',
  State: 'state',
  InstallProgress: 'install.progress',
  Result: 'result',
} as const satisfies Record<string, AgentEventName>;

export type AgentCommand<E extends AgentCommandName = AgentCommandName> = {
  [K in AgentCommandName]: { event: K; data: AgentMeta & AgentCommandMap[K] };
}[E];

export type AgentEvent<E extends AgentEventName = AgentEventName> = {
  [K in AgentEventName]: { event: K; data: AgentMeta & AgentEventMap[K] };
}[E];

export type AgentMessage = AgentCommand | AgentEvent;
