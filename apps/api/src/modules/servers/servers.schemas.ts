import { POWER_ACTION_VALUES, SERVER_POWER_STATE_VALUES, SERVER_STATUS_VALUES } from '@swifty/sdk';
import { z } from 'zod';

const envSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  .describe('Template variable values; anything omitted uses the template default');

const serverFields = {
  name: z.string().min(1).max(64).describe('Display name of the game server'),
  cpuPercent: z.int().min(25).max(10000).describe('CPU limit; 100 = one full core'),
  memoryMb: z.int().min(128).describe('Memory limit in MiB'),
  diskMb: z.int().min(256).describe('Disk limit in MiB'),
  env: envSchema,
};

export const createServerSchema = z.object({
  ...serverFields,
  env: envSchema.default({}),
  ownerId: z.uuid().describe('User who owns and manages this server'),
  nodeId: z.uuid().describe('Node the server runs on'),
  allocationId: z.uuid().describe('Free allocation on that node; becomes the primary IP:port'),
  templateId: z.string().min(1).describe('Game template identifier, e.g. counter-strike-16'),
});

export type CreateServerBody = z.infer<typeof createServerSchema>;

export const updateServerSchema = z.object(serverFields).partial();

export type UpdateServerBody = z.infer<typeof updateServerSchema>;

export const sftpInfoResponseSchema = z.object({
  host: z.string().describe('Hostname to connect the SFTP client to'),
  port: z.int().describe('SFTP port on the node'),
  username: z.string().describe('SFTP login name for this server'),
});

export const sftpCredentialsResponseSchema = sftpInfoResponseSchema.extend({
  password: z
    .string()
    .describe('Newly generated SFTP password; shown once and never retrievable again'),
});

export const serverResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  ownerId: z.uuid(),
  nodeId: z.uuid(),
  templateId: z.string(),
  status: z
    .enum(SERVER_STATUS_VALUES)
    .describe('Install lifecycle state; live run state is powerState'),
  powerState: z
    .enum(SERVER_POWER_STATE_VALUES)
    .describe('Last run state reported by the node daemon'),
  powerStateChangedAt: z.iso
    .datetime()
    .nullable()
    .describe('When the run state last changed; null if the server never ran'),
  lastExitCode: z
    .int()
    .nullable()
    .describe('Exit code of the last stop or crash, when the daemon reported one'),
  cpuPercent: z.int(),
  memoryMb: z.int(),
  diskMb: z.int(),
  env: z.record(z.string(), z.string()),
  sftpUsername: z.string().describe('SFTP login name; set a password with the rotate endpoint'),
  allocation: z
    .object({ id: z.uuid(), ip: z.string(), port: z.int() })
    .nullable()
    .describe('Primary IP:port of the server'),
  createdAt: z.iso.datetime(),
});

export const powerBodySchema = z.object({
  action: z
    .enum(POWER_ACTION_VALUES)
    .describe('start boots the server, restart stop-starts it, stop is graceful, kill is not'),
});

export type PowerBody = z.infer<typeof powerBodySchema>;
