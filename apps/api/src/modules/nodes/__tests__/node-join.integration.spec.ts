import { afterAll, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { hashToken, TOKEN_PREFIX } from '../../../common/crypto';
import type { EnvService } from '../../../config/env.service';
import type { Database } from '../../../db/database.module';
import { nodes, oneTimeTokens } from '../../../db/schema';
import { createTestHarness, describeDb, expectAppError, mustExist } from '../../../testing/harness';
import { AgentRegistry } from '../../agent-gateway/agent.registry';
import { TokensService } from '../../tokens/tokens.service';
import { NodesService } from '../nodes.service';

describeDb('Node join (integration)', () => {
  const harness = createTestHarness();
  afterAll(() => harness.close());

  const env = { appSecret: 'integration-test-secret-32-chars!' } as EnvService;
  const service = (db: Database) =>
    new NodesService(db, env, new AgentRegistry(), new TokensService(db));

  const registerBody = (token: string) => ({
    token,
    hostname: 'rs-beg-02',
    daemonPort: 8443,
  });

  it('registers a node with a fresh join token and burns it', () =>
    harness.tx(async (db) => {
      const nodesService = service(db);
      const { token, expiresAt } = await nodesService.createJoinToken();
      expect(token).toStartWith(`${TOKEN_PREFIX.NodeJoin}_`);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

      const config = await nodesService.registerNode(registerBody(token), '89.216.4.13');
      expect(config.token).toStartWith(`${TOKEN_PREFIX.Node}_`);
      expect(config.listen).toBe('0.0.0.0:8443');

      const [node] = await db.select().from(nodes).where(eq(nodes.name, 'rs-beg-02'));
      expect(mustExist(node).fqdn).toBe('89.216.4.13');
      expect(mustExist(node).tokenHash).toBe(hashToken(config.token));

      await expectAppError(
        nodesService.registerNode(registerBody(token), '89.216.4.13'),
        'nodes.join_token_invalid',
      );
    }));

  it('rejects unknown and expired join tokens', () =>
    harness.tx(async (db) => {
      const nodesService = service(db);
      await expectAppError(
        nodesService.registerNode(registerBody(`${TOKEN_PREFIX.NodeJoin}_nope`), '1.2.3.4'),
        'nodes.join_token_invalid',
      );

      const { token } = await nodesService.createJoinToken();
      await db
        .update(oneTimeTokens)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(oneTimeTokens.tokenHash, hashToken(token)));
      await expectAppError(
        nodesService.registerNode(registerBody(token), '1.2.3.4'),
        'nodes.join_token_invalid',
      );
    }));

  it('suffixes the node name when the hostname is taken', () =>
    harness.tx(async (db) => {
      const nodesService = service(db);
      const first = await nodesService.createJoinToken();
      await nodesService.registerNode(registerBody(first.token), '1.1.1.1');
      const second = await nodesService.createJoinToken();
      await nodesService.registerNode(registerBody(second.token), '2.2.2.2');

      const [suffixed] = await db.select().from(nodes).where(eq(nodes.name, 'rs-beg-02-2'));
      expect(mustExist(suffixed).fqdn).toBe('2.2.2.2');
    }));

  it('prefers an explicit fqdn over the request address', () =>
    harness.tx(async (db) => {
      const nodesService = service(db);
      const { token } = await nodesService.createJoinToken();
      await nodesService.registerNode(
        { ...registerBody(token), fqdn: 'node2.example.com' },
        '9.9.9.9',
      );
      const [node] = await db.select().from(nodes).where(eq(nodes.name, 'rs-beg-02'));
      expect(mustExist(node).fqdn).toBe('node2.example.com');
    }));
});
