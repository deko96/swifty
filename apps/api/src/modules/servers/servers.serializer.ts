import type { ServerWithAllocation } from './servers.service';

export function toServerResponse({ server, allocation }: ServerWithAllocation) {
  return {
    id: server.id,
    name: server.name,
    ownerId: server.ownerId,
    nodeId: server.nodeId,
    templateId: server.templateId,
    status: server.status,
    cpuPercent: server.cpuPercent,
    memoryMb: server.memoryMb,
    diskMb: server.diskMb,
    env: server.env,
    allocation: allocation ? { id: allocation.id, ip: allocation.ip, port: allocation.port } : null,
    createdAt: server.createdAt.toISOString(),
  };
}
