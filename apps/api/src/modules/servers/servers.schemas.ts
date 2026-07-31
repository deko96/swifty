import { SERVER_STATUS_VALUES } from '@swifty/sdk';
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

export const serverResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  ownerId: z.uuid(),
  nodeId: z.uuid(),
  templateId: z.string(),
  status: z
    .enum(SERVER_STATUS_VALUES)
    .describe('Install lifecycle state; live run state comes from the node daemon'),
  cpuPercent: z.int(),
  memoryMb: z.int(),
  diskMb: z.int(),
  env: z.record(z.string(), z.string()),
  allocation: z
    .object({ id: z.uuid(), ip: z.string(), port: z.int() })
    .nullable()
    .describe('Primary IP:port of the server'),
  createdAt: z.iso.datetime(),
});
