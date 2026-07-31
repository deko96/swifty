import { afterAll, expect, it } from 'bun:test';
import { AGENT_PROTOCOL_VERSION } from '@swifty/sdk';
import { generateToken, TOKEN_PREFIX } from '../../common/crypto';
import type { EnvService } from '../../config/env.service';
import type { Database } from '../../db/database.module';
import { createTestHarness, describeDb } from '../../testing/harness';
import { NodesService } from '../nodes/nodes.service';
import { AgentAuthService } from './agent-auth.service';
import type { HelloData } from './agent-gateway.schemas';
import { AgentRegistry } from './agent-registry';

describeDb('AgentAuthService (integration)', () => {
  const harness = createTestHarness();
  afterAll(() => harness.close());

  const env = { appSecret: 'integration-test-secret-32-chars!' } as EnvService;
  const nodesService = (db: Database) => new NodesService(db, env, new AgentRegistry());

  const nodeBody = {
    name: 'node-1',
    fqdn: 'node1.test.local',
    daemonPort: 8443,
    public: true,
    memoryMb: 16384,
    diskMb: 102400,
  };

  const hello: HelloData = {
    v: AGENT_PROTOCOL_VERSION,
    id: '018f2c3a-c774-7f12-ac13-95d4e6f70819',
    protocol: AGENT_PROTOCOL_VERSION,
    daemonVersion: '0.9.4',
    inventory: {
      hostname: 'rs-beg-02',
      os: 'linux',
      arch: 'amd64',
      cpuModel: 'AMD Ryzen 7 5800X',
      cpuCores: 16,
      memoryMiB: 65536,
      diskMiB: 1907200,
    },
    ports: [],
  };

  it('authenticates the token issued at node creation', () =>
    harness.tx(async (db) => {
      const service = nodesService(db);
      const node = await service.create(nodeBody);
      const token = service.daemonConfig(node).token;

      const auth = new AgentAuthService(db);
      const authenticated = await auth.authenticate(`Bearer ${token}`);
      expect(authenticated?.id).toBe(node.id);
    }));

  it('rejects missing, malformed, and unknown tokens', () =>
    harness.tx(async (db) => {
      const auth = new AgentAuthService(db);
      expect(await auth.authenticate(undefined)).toBeNull();
      expect(await auth.authenticate('Bearer not-a-node-token')).toBeNull();
      expect(await auth.authenticate(`Bearer ${generateToken(TOKEN_PREFIX.Node)}`)).toBeNull();
    }));

  it('rejects a token after rotation', () =>
    harness.tx(async (db) => {
      const service = nodesService(db);
      const node = await service.create(nodeBody);
      const before = service.daemonConfig(node).token;
      await service.rotateToken(node.id);

      const auth = new AgentAuthService(db);
      expect(await auth.authenticate(`Bearer ${before}`)).toBeNull();
      const rotated = await service.findById(node.id);
      const after = service.daemonConfig(rotated).token;
      expect((await auth.authenticate(`Bearer ${after}`))?.id).toBe(node.id);
    }));

  it('recordHello stores version, inventory, and last-seen', () =>
    harness.tx(async (db) => {
      const service = nodesService(db);
      const node = await service.create(nodeBody);

      const auth = new AgentAuthService(db);
      await auth.recordHello(node.id, hello);

      const updated = await service.findById(node.id);
      expect(updated.daemonVersion).toBe('0.9.4');
      expect(updated.inventory?.hostname).toBe('rs-beg-02');
      expect(updated.lastSeenAt).not.toBeNull();
    }));
});
