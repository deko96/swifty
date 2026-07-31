import type { Allocation, Node } from '../../db/schema';

export function toNodeResponse(node: Node) {
  return {
    id: node.id,
    name: node.name,
    fqdn: node.fqdn,
    daemonPort: node.daemonPort,
    public: node.public,
    memoryMb: node.memoryMb,
    diskMb: node.diskMb,
    createdAt: node.createdAt.toISOString(),
  };
}

export function toAllocationResponse(allocation: Allocation) {
  return {
    id: allocation.id,
    nodeId: allocation.nodeId,
    ip: allocation.ip,
    port: allocation.port,
    serverId: allocation.serverId,
    primary: allocation.primary,
  };
}
