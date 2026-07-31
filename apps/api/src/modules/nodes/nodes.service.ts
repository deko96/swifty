import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { AppException } from '../../common/app.exception';
import {
  decryptSecret,
  encryptSecret,
  generateToken,
  hashToken,
  TOKEN_PREFIX,
} from '../../common/crypto';
import { EnvService } from '../../config/env.service';
import { DATABASE, type Database } from '../../db/database.module';
import { allocations, type Node, nodes, servers } from '../../db/schema';
import { AgentRegistry } from '../agent-gateway/agent-registry';
import type { CreateAllocationsBody, CreateNodeBody, UpdateNodeBody } from './nodes.schemas';
import { expandPortEntries } from './port-range';

@Injectable()
export class NodesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly env: EnvService,
    private readonly registry: AgentRegistry,
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

    const token = generateToken(TOKEN_PREFIX.Node);
    const [node] = await this.db
      .insert(nodes)
      .values({
        ...body,
        tokenEncrypted: encryptSecret(token, this.env.appSecret),
        tokenHash: hashToken(token),
      })
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
    const token = generateToken(TOKEN_PREFIX.Node);
    const [node] = await this.db
      .update(nodes)
      .set({
        tokenEncrypted: encryptSecret(token, this.env.appSecret),
        tokenHash: hashToken(token),
        updatedAt: new Date(),
      })
      .where(eq(nodes.id, id))
      .returning();
    if (!node) {
      throw new AppException(404, 'nodes.not_found', 'Node not found');
    }
    return node;
  }

  daemonConfig(node: Node): { listen: string; token: string; dataDir: string; panelUrl?: string } {
    return {
      listen: `0.0.0.0:${node.daemonPort}`,
      token: decryptSecret(node.tokenEncrypted, this.env.appSecret),
      dataDir: '/opt/swifty/servers',
      ...(this.env.panelUrl ? { panelUrl: this.env.panelUrl } : {}),
    };
  }

  health(node: Node): { online: boolean; version?: string; lastSeenAt: Date | null } {
    return {
      online: this.registry.isOnline(node.id),
      version: node.daemonVersion ?? undefined,
      lastSeenAt: node.lastSeenAt,
    };
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
