import {
  AGENT_PROTOCOL_VERSION,
  PORT_PROTOCOL_VALUES,
  SERVER_POWER_STATE_VALUES,
} from '@swifty/sdk';
import { z } from 'zod';

/**
 * Inbound agent events, validated at the gateway. The wire contract is
 * defined in @swifty/sdk (agent.ts); these schemas enforce it at runtime.
 */
const metaShape = {
  v: z.literal(AGENT_PROTOCOL_VERSION),
  id: z.string().min(1),
};

export const helloDataSchema = z.object({
  ...metaShape,
  protocol: z.number().int().positive(),
  daemonVersion: z.string().max(32),
  inventory: z.object({
    hostname: z.string().max(255),
    os: z.string().max(32),
    arch: z.string().max(32),
    cpuModel: z.string().max(255),
    cpuCores: z.number().int().nonnegative(),
    memoryMiB: z.number().int().nonnegative(),
    diskMiB: z.number().int().nonnegative(),
  }),
  ports: z.array(
    z.object({
      protocol: z.enum(PORT_PROTOCOL_VALUES),
      port: z.number().int().min(1).max(65535),
      open: z.boolean(),
    }),
  ),
});

export type HelloData = z.infer<typeof helloDataSchema>;

export const stateDataSchema = z.object({
  ...metaShape,
  serverId: z.uuid(),
  state: z.enum(SERVER_POWER_STATE_VALUES),
  exitCode: z.number().int().optional(),
});

export type StateData = z.infer<typeof stateDataSchema>;

export const installProgressDataSchema = z.object({
  ...metaShape,
  serverId: z.uuid(),
  line: z.string(),
});

export type InstallProgressData = z.infer<typeof installProgressDataSchema>;

export const resultDataSchema = z.object({
  ...metaShape,
  commandId: z.string().min(1),
  ok: z.boolean(),
  error: z.string().optional(),
  output: z.string().optional(),
});

export type ResultData = z.infer<typeof resultDataSchema>;
