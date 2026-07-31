import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { AppException } from '../../common/app.exception';
import { decryptSecret, encryptSecret, generateToken } from '../../common/crypto';
import { EnvService } from '../../config/env.service';
import { DATABASE, type Database } from '../../db/database.module';
import { allocations, type Node, nodes, servers } from '../../db/schema';
import type { CreateAllocationsBody, CreateNodeBody, UpdateNodeBody } from './nodes.schemas';
import { expandPortEntries } from './port-range';

const DAEMON_TIMEOUT_MS = 5000;

@Injectable()
export class NodesService {
  private readonly logger = new Logger(NodesService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly env: EnvService,
  ) {}

  async list(): Promise<Node[]> {
    return this.db.select().from(nodes).orderBy(nodes.createdAt);
  }

  async findById(id: string): Promise<Node> {
    const [node] = await this.db.select().from(nodes).where(eq(nodes.id, id)).limit(1);
    if (!node) {
      throw new AppException(404, 'nodes.not_found', 'Node not found');
    }
    return node;
  }

  async create(body: CreateNodeBody): Promise<Node> {
    const [existing] = await this.db
      .select({ id: nodes.id })
      .from(nodes)
      .where(eq(nodes.name, body.name))
      .limit(1);
    if (existing) {
      throw new AppException(409, 'nodes.name_taken', 'A node with this name already exists');
    }

    const token = generateToken('node');
    const [node] = await this.db
      .insert(nodes)
      .values({ ...body, tokenEncrypted: encryptSecret(token, this.env.appSecret) })
      .returning();
    if (!node) {
      throw new Error('Insert returned no row');
    }
    return node;
  }

  async update(id: string, body: UpdateNodeBody): Promise<Node> {
    await this.findById(id);
    if (body.name !== undefined) {
      const [existing] = await this.db
        .select({ id: nodes.id })
        .from(nodes)
        .where(eq(nodes.name, body.name))
        .limit(1);
      if (existing && existing.id !== id) {
        throw new AppException(409, 'nodes.name_taken', 'A node with this name already exists');
      }
    }
    const [node] = await this.db
      .update(nodes)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(nodes.id, id))
      .returning();
    if (!node) {
      throw new AppException(404, 'nodes.not_found', 'Node not found');
    }
    return node;
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    const [server] = await this.db
      .select({ id: servers.id })
      .from(servers)
      .where(eq(servers.nodeId, id))
      .limit(1);
    if (server) {
      throw new AppException(
        409,
        'nodes.has_servers',
        'This node still hosts game servers; move or delete them first',
      );
    }
    await this.db.delete(nodes).where(eq(nodes.id, id));
  }

  async rotateToken(id: string): Promise<Node> {
    await this.findById(id);
    const token = generateToken('node');
    const [node] = await this.db
      .update(nodes)
      .set({ tokenEncrypted: encryptSecret(token, this.env.appSecret), updatedAt: new Date() })
      .where(eq(nodes.id, id))
      .returning();
    if (!node) {
      throw new AppException(404, 'nodes.not_found', 'Node not found');
    }
    return node;
  }

  daemonConfig(node: Node): { listen: string; token: string; dataDir: string } {
    return {
      listen: `0.0.0.0:${node.daemonPort}`,
      token: decryptSecret(node.tokenEncrypted, this.env.appSecret),
      dataDir: '/opt/swifty/servers',
    };
  }

  async checkHealth(node: Node): Promise<{ online: boolean; version?: string }> {
    const token = decryptSecret(node.tokenEncrypted, this.env.appSecret);
    try {
      const response = await fetch(`http://${node.fqdn}:${node.daemonPort}/v1/system`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(DAEMON_TIMEOUT_MS),
      });
      if (!response.ok) {
        return { online: false };
      }
      const body = (await response.json()) as { version?: string };
      return { online: true, version: body.version };
    } catch (error) {
      this.logger.debug(`Node ${node.name} unreachable: ${String(error)}`);
      return { online: false };
    }
  }

  async listAllocations(nodeId: string) {
    await this.findById(nodeId);
    return this.db
      .select()
      .from(allocations)
      .where(eq(allocations.nodeId, nodeId))
      .orderBy(allocations.ip, allocations.port);
  }

  async createAllocations(
    nodeId: string,
    body: CreateAllocationsBody,
  ): Promise<{ created: number; skipped: number }> {
    await this.findById(nodeId);
    const ports = expandPortEntries(body.ports);
    if (!ports) {
      throw new AppException(
        400,
        'allocations.range_too_large',
        'Port entries must stay within 1-65535 and expand to at most 1000 ports',
      );
    }

    const inserted = await this.db
      .insert(allocations)
      .values(ports.map((port) => ({ nodeId, ip: body.ip, port })))
      .onConflictDoNothing()
      .returning({ id: allocations.id });

    return { created: inserted.length, skipped: ports.length - inserted.length };
  }

  async deleteAllocation(nodeId: string, allocationId: string): Promise<void> {
    const [allocation] = await this.db
      .select()
      .from(allocations)
      .where(and(eq(allocations.id, allocationId), eq(allocations.nodeId, nodeId)))
      .limit(1);
    if (!allocation) {
      throw new AppException(404, 'allocations.not_found', 'Allocation not found');
    }
    if (allocation.serverId) {
      throw new AppException(
        409,
        'allocations.in_use',
        'This allocation is assigned to a server; free it first',
      );
    }
    await this.db.delete(allocations).where(eq(allocations.id, allocationId));
  }
}
