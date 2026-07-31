import { afterAll, expect, it } from 'bun:test';
import { TOKEN_PREFIX } from '../../common/crypto';
import type { EnvService } from '../../config/env.service';
import type { Database } from '../../db/database.module';
import { allocations, servers, users } from '../../db/schema';
import { createTestHarness, describeDb, expectAppError, mustExist } from '../../testing/harness';
import { AgentRegistry } from '../agent-gateway/agent-registry';
import { NodesService } from './nodes.service';

describeDb('NodesService (integration)', () => {
  const harness = createTestHarness();
  afterAll(() => harness.close());

  const env = { appSecret: 'integration-test-secret-32-chars!' } as EnvService;
  const service = (db: Database) => new NodesService(db, env, new AgentRegistry());

  const nodeBody = {
    name: 'node-1',
    fqdn: 'node1.test.local',
    daemonPort: 8443,
    public: true,
    memoryMb: 16384,
    diskMb: 102400,
  };

  it('creates a node whose token round-trips through encryption', () =>
    harness.tx(async (db) => {
      const nodes = service(db);
      const node = await nodes.create(nodeBody);
      expect(node.tokenEncrypted).not.toContain(`${TOKEN_PREFIX.Node}_`);

      const config = nodes.daemonConfig(node);
      expect(config.token).toStartWith(`${TOKEN_PREFIX.Node}_`);
      expect(config.listen).toBe('0.0.0.0:8443');
    }));

  it('rotating the token invalidates the previous one', () =>
    harness.tx(async (db) => {
      const nodes = service(db);
      const node = await nodes.create(nodeBody);
      const before = nodes.daemonConfig(node).token;
      const rotated = await nodes.rotateToken(node.id);
      const after = nodes.daemonConfig(rotated).token;
      expect(after).toStartWith(`${TOKEN_PREFIX.Node}_`);
      expect(after).not.toBe(before);
    }));

  it('rejects duplicate names on create and update', () =>
    harness.tx(async (db) => {
      const nodes = service(db);
      const first = await nodes.create(nodeBody);
      await expectAppError(nodes.create({ ...nodeBody }), 'nodes.name_taken');

      const second = await nodes.create({ ...nodeBody, name: 'node-2' });
      await expectAppError(nodes.update(second.id, { name: first.name }), 'nodes.name_taken');
      expect((await nodes.update(second.id, { name: 'node-2' })).name).toBe('node-2');
    }));

  it('partial update leaves other fields untouched', () =>
    harness.tx(async (db) => {
      const nodes = service(db);
      const node = await nodes.create({ ...nodeBody, daemonPort: 9000, public: false });
      const updated = await nodes.update(node.id, { name: 'renamed' });
      expect(updated.daemonPort).toBe(9000);
      expect(updated.public).toBe(false);
    }));

  it('creates allocations idempotently and guards deletion of used ones', () =>
    harness.tx(async (db) => {
      const nodes = service(db);
      const node = await nodes.create(nodeBody);

      const first = await nodes.createAllocations(node.id, {
        ip: '10.0.0.1',
        ports: ['27015-27017'],
      });
      expect(first).toEqual({ created: 3, skipped: 0 });
      const again = await nodes.createAllocations(node.id, {
        ip: '10.0.0.1',
        ports: ['27015-27019'],
      });
      expect(again).toEqual({ created: 2, skipped: 3 });

      await expectAppError(
        nodes.createAllocations(node.id, { ip: '10.0.0.1', ports: ['1-2000'] }),
        'allocations.range_too_large',
      );

      const list = await nodes.listAllocations(node.id);
      expect(list).toHaveLength(5);

      const [owner] = await db
        .insert(users)
        .values({
          email: 'owner@test.local',
          username: 'owner',
          passwordHash: 'irrelevant',
        })
        .returning();
      const [server] = await db
        .insert(servers)
        .values({
          name: 'cs',
          ownerId: mustExist(owner).id,
          nodeId: node.id,
          templateId: 'counter-strike-16',
          cpuPercent: 100,
          memoryMb: 1024,
          diskMb: 10240,
          sftpUsername: 'srv_test_fixture',
        })
        .returning();
      const used = mustExist(list[0]);
      await db.update(allocations).set({ serverId: mustExist(server).id });

      await expectAppError(nodes.deleteAllocation(node.id, used.id), 'allocations.in_use');
      await expectAppError(nodes.delete(node.id), 'nodes.has_servers');

      await db.delete(servers);
      await nodes.deleteAllocation(node.id, used.id);
      await nodes.delete(node.id);
      await expectAppError(nodes.findById(node.id), 'nodes.not_found');
    }));
});
