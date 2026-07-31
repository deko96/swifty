import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
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
import { allocations, type Node, nodeJoinTokens, nodes, servers } from '../../db/schema';
import { AgentRegistry } from '../agent-gateway/agent.registry';
import type {
  CreateAllocationsBody,
  CreateNodeBody,
  RegisterNodeBody,
  UpdateNodeBody,
} from './nodes.schemas';
import { expandPortEntries } from './port-range';

export const JOIN_TOKEN_TTL_MS = 15 * 60_000;

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

  async createJoinToken(): Promise<{ token: string; expiresAt: Date }> {
    const token = generateToken(TOKEN_PREFIX.NodeJoin);
    const expiresAt = new Date(Date.now() + JOIN_TOKEN_TTL_MS);
    await this.db.insert(nodeJoinTokens).values({ tokenHash: hashToken(token), expiresAt });
    return { token, expiresAt };
  }

  /**
   * Called by a fresh daemon with a one-time join token: spends the token,
   * creates the node, and returns the daemon configuration — the only time
   * the node token leaves the panel in plaintext.
   */
  async registerNode(body: RegisterNodeBody, remoteAddress: string) {
    const node = await this.db.transaction(async (tx) => {
      const [spent] = await tx
        .update(nodeJoinTokens)
        .set({ usedAt: new Date() })
        .where(
          and(eq(nodeJoinTokens.tokenHash, hashToken(body.token)), isNull(nodeJoinTokens.usedAt)),
        )
        .returning();
      if (!spent || spent.expiresAt < new Date()) {
        throw new AppException(
          401,
          'nodes.join_token_invalid',
          'This join token is unknown, expired, or already used — issue a fresh one',
        );
      }

      const token = generateToken(TOKEN_PREFIX.Node);
      const [created] = await tx
        .insert(nodes)
        .values({
          name: await this.availableName(tx, body.hostname),
          fqdn: body.fqdn ?? remoteAddress,
          daemonPort: body.daemonPort,
          tokenEncrypted: encryptSecret(token, this.env.appSecret),
          tokenHash: hashToken(token),
          memoryMb: 0,
          diskMb: 0,
        })
        .returning();
      if (!created) {
        throw new Error('Insert returned no row');
      }
      return created;
    });

    return this.daemonConfig(node);
  }

  /** Node names are unique; a re-joining hostname gets a numeric suffix. */
  private async availableName(tx: Pick<Database, 'select'>, hostname: string): Promise<string> {
    const taken = new Set(
      (await tx.select({ name: nodes.name }).from(nodes)).map((row) => row.name),
    );
    if (!taken.has(hostname)) {
      return hostname;
    }
    let suffix = 2;
    while (taken.has(`${hostname}-${suffix}`)) {
      suffix += 1;
    }
    return `${hostname}-${suffix}`;
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
