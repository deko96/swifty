import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { hashToken, hasTokenPrefix, TOKEN_PREFIX } from '../../common/crypto';
import { DATABASE, type Database } from '../../db/database.module';
import { type Node, nodes } from '../../db/schema';
import type { HelloData } from './agent-gateway.schemas';

/**
 * Authentication and persistence for agent connections. Lives apart from the
 * gateway so the database-facing logic is testable without sockets.
 */
@Injectable()
export class AgentAuthService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async authenticate(authorizationHeader: string | undefined): Promise<Node | null> {
    const bearer = 'Bearer ';
    if (!authorizationHeader?.startsWith(bearer)) {
      return null;
    }
    const token = authorizationHeader.slice(bearer.length);
    if (!hasTokenPrefix(token, TOKEN_PREFIX.Node)) {
      return null;
    }
    const [node] = await this.db
      .select()
      .from(nodes)
      .where(eq(nodes.tokenHash, hashToken(token)))
      .limit(1);
    return node ?? null;
  }

  async recordHello(nodeId: string, hello: HelloData): Promise<void> {
    await this.db
      .update(nodes)
      .set({
        daemonVersion: hello.daemonVersion,
        inventory: hello.inventory,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(nodes.id, nodeId));
  }

  async recordSeen(nodeId: string): Promise<void> {
    await this.db.update(nodes).set({ lastSeenAt: new Date() }).where(eq(nodes.id, nodeId));
  }
}
