import { z } from 'zod';
import { PORT_ENTRY } from './port-range';

const nodeFields = {
  name: z
    .string()
    .min(1)
    .max(64)
    .describe('Short display name of the machine, e.g. "de-frankfurt-1"'),
  fqdn: z
    .string()
    .min(1)
    .max(255)
    .describe('Hostname or IP address the panel uses to reach the daemon'),
  daemonPort: z.int().min(1).max(65535).describe('Port the daemon listens on'),
  public: z
    .boolean()
    .describe('Public nodes accept new servers; private ones are hidden from placement'),
  memoryMb: z.int().min(1).describe('Total memory available for game servers, in MiB'),
  diskMb: z.int().min(1).describe('Total disk available for game servers, in MiB'),
};

export const createNodeSchema = z.object({
  ...nodeFields,
  daemonPort: nodeFields.daemonPort.default(8443),
  public: nodeFields.public.default(true),
});

export type CreateNodeBody = z.infer<typeof createNodeSchema>;

// Built from the default-free fields: defaults in a PATCH schema would
// silently reset daemonPort and public on every partial update.
export const updateNodeSchema = z.object(nodeFields).partial();

export type UpdateNodeBody = z.infer<typeof updateNodeSchema>;

export const nodeResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  fqdn: z.string(),
  daemonPort: z.int(),
  public: z.boolean(),
  memoryMb: z.int(),
  diskMb: z.int(),
  createdAt: z.iso.datetime(),
});

export const nodeConfigResponseSchema = z.object({
  listen: z.string().describe('Address the daemon should bind, host:port'),
  token: z.string().describe('Secret this node uses to authenticate the panel — keep it private'),
  dataDir: z.string().describe('Directory game servers live in on the node'),
});

export const nodeHealthResponseSchema = z.object({
  online: z.boolean().describe('Whether the panel could reach the daemon just now'),
  version: z.string().optional().describe('Daemon version reported by the node, when online'),
});

export const createAllocationsSchema = z.object({
  ip: z.union([z.ipv4(), z.ipv6()]).describe('IP address game servers bind on this node'),
  ports: z
    .array(z.string().regex(PORT_ENTRY))
    .nonempty()
    .describe('Ports or ranges, e.g. ["27015", "27020-27030"]; at most 1000 ports per request'),
});

export type CreateAllocationsBody = z.infer<typeof createAllocationsSchema>;

export const allocationResponseSchema = z.object({
  id: z.uuid(),
  nodeId: z.uuid(),
  ip: z.string(),
  port: z.int(),
  serverId: z.uuid().nullable().describe('Server currently using this allocation, if any'),
  primary: z.boolean(),
});

export const createAllocationsResponseSchema = z.object({
  created: z.int().describe('How many new allocations were added'),
  skipped: z.int().describe('How many already existed and were left untouched'),
});
