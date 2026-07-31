import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { UserRole } from '@swifty/sdk';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { AppException } from '../../common/app.exception';
import { DATABASE, type Database } from '../../db/database.module';
import {
  type Allocation,
  allocations,
  type Node,
  nodes,
  type Server,
  servers,
  type User,
  users,
} from '../../db/schema';
import { TemplatesService } from '../templates/templates.service';
import type { CreateServerBody, UpdateServerBody } from './servers.schemas';
import { generateSftpPassword, sftpUsername } from './sftp';
import { resolveEnv } from './variable-rules';

export const SFTP_PORT = 2022;

export interface ServerWithAllocation {
  server: Server;
  allocation: Allocation | null;
}

export interface SftpInfo {
  host: string;
  port: number;
  username: string;
}

@Injectable()
export class ServersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly templates: TemplatesService,
  ) {}

  async listFor(user: User): Promise<ServerWithAllocation[]> {
    const rows =
      user.role === UserRole.Admin
        ? await this.db.select().from(servers).orderBy(servers.createdAt)
        : await this.db
            .select()
            .from(servers)
            .where(eq(servers.ownerId, user.id))
            .orderBy(servers.createdAt);
    return this.withPrimaryAllocations(rows);
  }

  async findFor(user: User, id: string): Promise<ServerWithAllocation> {
    const [server] = await this.db.select().from(servers).where(eq(servers.id, id)).limit(1);
    if (!server || (user.role !== UserRole.Admin && server.ownerId !== user.id)) {
      throw new AppException(404, 'servers.not_found', 'Server not found');
    }
    const [withAllocation] = await this.withPrimaryAllocations([server]);
    if (!withAllocation) {
      throw new AppException(404, 'servers.not_found', 'Server not found');
    }
    return withAllocation;
  }

  async create(body: CreateServerBody): Promise<ServerWithAllocation> {
    const template = this.templates.findById(body.templateId);
    const env = this.resolveEnvOrThrow(template.id, this.stringifyEnv(body.env));

    return this.db.transaction(async (tx) => {
      const [owner] = await tx.select().from(users).where(eq(users.id, body.ownerId)).limit(1);
      if (!owner) {
        throw new AppException(404, 'users.not_found', 'Owner not found');
      }
      const [node] = await tx.select().from(nodes).where(eq(nodes.id, body.nodeId)).limit(1);
      if (!node) {
        throw new AppException(404, 'nodes.not_found', 'Node not found');
      }

      const claimed = await tx
        .update(allocations)
        .set({ primary: true })
        .where(
          and(
            eq(allocations.id, body.allocationId),
            eq(allocations.nodeId, body.nodeId),
            isNull(allocations.serverId),
          ),
        )
        .returning();
      const allocation = claimed[0];
      if (!allocation) {
        throw new AppException(
          409,
          'allocations.not_available',
          'The allocation does not exist on this node or is already in use',
        );
      }

      const id = randomUUID();
      const [server] = await tx
        .insert(servers)
        .values({
          id,
          name: body.name,
          ownerId: body.ownerId,
          nodeId: body.nodeId,
          templateId: template.id,
          cpuPercent: body.cpuPercent,
          memoryMb: body.memoryMb,
          diskMb: body.diskMb,
          env,
          sftpUsername: sftpUsername(id),
        })
        .returning();
      if (!server) {
        throw new Error('Insert returned no row');
      }

      await tx
        .update(allocations)
        .set({ serverId: server.id })
        .where(eq(allocations.id, allocation.id));

      return { server, allocation: { ...allocation, serverId: server.id } };
    });
  }

  async update(id: string, body: UpdateServerBody): Promise<ServerWithAllocation> {
    const [existing] = await this.db.select().from(servers).where(eq(servers.id, id)).limit(1);
    if (!existing) {
      throw new AppException(404, 'servers.not_found', 'Server not found');
    }

    let env = existing.env;
    if (body.env) {
      env = this.resolveEnvOrThrow(existing.templateId, {
        ...existing.env,
        ...this.stringifyEnv(body.env),
      });
    }

    const [updated] = await this.db
      .update(servers)
      .set({
        name: body.name,
        cpuPercent: body.cpuPercent,
        memoryMb: body.memoryMb,
        diskMb: body.diskMb,
        env,
        updatedAt: new Date(),
      })
      .where(eq(servers.id, id))
      .returning();
    if (!updated) {
      throw new AppException(404, 'servers.not_found', 'Server not found');
    }
    const [withAllocation] = await this.withPrimaryAllocations([updated]);
    return withAllocation ?? { server: updated, allocation: null };
  }

  sftpInfo(user: User, server: Server, node: Node): SftpInfo {
    void user;
    return { host: node.fqdn, port: SFTP_PORT, username: server.sftpUsername };
  }

  async rotateSftpPassword(user: User, id: string): Promise<{ info: SftpInfo; password: string }> {
    const { server } = await this.findFor(user, id);
    const [node] = await this.db.select().from(nodes).where(eq(nodes.id, server.nodeId)).limit(1);
    if (!node) {
      throw new AppException(404, 'nodes.not_found', 'Node not found');
    }

    const password = generateSftpPassword();
    await this.db
      .update(servers)
      .set({
        sftpPasswordHash: await Bun.password.hash(password, 'argon2id'),
        updatedAt: new Date(),
      })
      .where(eq(servers.id, id));

    return { info: this.sftpInfo(user, server, node), password };
  }

  /**
   * Verifies SFTP credentials for the daemon's embedded SFTP server. Returns
   * the server directory to jail the session to, or null when the credentials
   * do not match. Never throws AppException — this is a machine boundary.
   */
  async verifySftp(username: string, password: string): Promise<{ serverId: string } | null> {
    const [server] = await this.db
      .select()
      .from(servers)
      .where(eq(servers.sftpUsername, username))
      .limit(1);
    if (!server?.sftpPasswordHash) {
      return null;
    }
    if (!(await Bun.password.verify(password, server.sftpPasswordHash))) {
      return null;
    }
    return { serverId: server.id };
  }

  async delete(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const freed = await tx
        .update(allocations)
        .set({ serverId: null, primary: false })
        .where(eq(allocations.serverId, id));
      void freed;
      const deleted = await tx
        .delete(servers)
        .where(eq(servers.id, id))
        .returning({ id: servers.id });
      if (deleted.length === 0) {
        throw new AppException(404, 'servers.not_found', 'Server not found');
      }
    });
  }

  private resolveEnvOrThrow(
    templateId: string,
    provided: Record<string, string>,
  ): Record<string, string> {
    const template = this.templates.findById(templateId);
    const { env, violations } = resolveEnv(template, provided);
    if (violations.length > 0) {
      throw new AppException(400, 'validation.failed', 'Validation failed', violations);
    }
    return env;
  }

  private stringifyEnv(env: Record<string, string | number | boolean>): Record<string, string> {
    return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, String(value)]));
  }

  private async withPrimaryAllocations(rows: Server[]): Promise<ServerWithAllocation[]> {
    if (rows.length === 0) {
      return [];
    }
    const primaries = await this.db
      .select()
      .from(allocations)
      .where(
        and(
          inArray(
            allocations.serverId,
            rows.map((server) => server.id),
          ),
          eq(allocations.primary, true),
        ),
      );
    const byServer = new Map(primaries.map((allocation) => [allocation.serverId, allocation]));
    return rows.map((server) => ({ server, allocation: byServer.get(server.id) ?? null }));
  }
}
