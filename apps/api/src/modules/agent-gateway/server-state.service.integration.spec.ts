import { afterAll, expect, it } from 'bun:test';
import {
  AGENT_PROTOCOL_VERSION,
  type EventPayload,
  ServerPowerState,
  ServerStatus,
} from '@swifty/sdk';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/database.module';
import { nodes, servers, users } from '../../db/schema';
import { createTestHarness, describeDb, mustExist } from '../../testing/harness';
import { EventBusService } from '../events/event-bus.service';
import type { StateData } from './agent-gateway.schemas';
import { ServerStateService } from './server-state.service';

describeDb('ServerStateService (integration)', () => {
  const harness = createTestHarness();
  afterAll(() => harness.close());

  async function fixtures(db: Database) {
    const [owner] = await db
      .insert(users)
      .values({ email: 'owner@t.local', username: 'owner', passwordHash: 'x' })
      .returning();
    const [node] = await db
      .insert(nodes)
      .values({
        name: 'n1',
        fqdn: 'n1.local',
        tokenEncrypted: 'x',
        tokenHash: 'x',
        memoryMb: 16384,
        diskMb: 102400,
      })
      .returning();
    const [server] = await db
      .insert(servers)
      .values({
        name: 's1',
        ownerId: mustExist(owner).id,
        nodeId: mustExist(node).id,
        templateId: 'counter-strike-16',
        status: ServerStatus.Installed,
        cpuPercent: 200,
        memoryMb: 4096,
        diskMb: 40960,
        sftpUsername: 'sftp_s1',
      })
      .returning();
    return { node: mustExist(node), server: mustExist(server) };
  }

  function state(serverId: string, value: StateData['state'], exitCode?: number): StateData {
    return {
      v: AGENT_PROTOCOL_VERSION,
      id: '018f2c3a-d885-7023-bd24-a6e5f7081920',
      serverId,
      state: value,
      ...(exitCode === undefined ? {} : { exitCode }),
    };
  }

  it('persists transitions and emits started/stopped bus events', () =>
    harness.tx(async (db) => {
      const { server } = await fixtures(db);
      const events = new EventBusService();
      const service = new ServerStateService(db, events);
      const started: EventPayload<'server.started'>[] = [];
      const stopped: EventPayload<'server.stopped'>[] = [];
      events.on('server.started', (payload) => {
        started.push(payload);
      });
      events.on('server.stopped', (payload) => {
        stopped.push(payload);
      });

      await service.recordState(state(server.id, ServerPowerState.Running));
      let [row] = await db.select().from(servers).where(eq(servers.id, server.id));
      expect(mustExist(row).powerState).toBe(ServerPowerState.Running);
      expect(mustExist(row).powerStateChangedAt).not.toBeNull();
      expect(started).toEqual([{ serverId: server.id }]);

      await service.recordState(state(server.id, ServerPowerState.Crashed, 139));
      [row] = await db.select().from(servers).where(eq(servers.id, server.id));
      expect(mustExist(row).powerState).toBe(ServerPowerState.Crashed);
      expect(mustExist(row).lastExitCode).toBe(139);
      expect(stopped).toEqual([{ serverId: server.id, exitCode: 139, crashed: true }]);
    }));

  it('ignores repeated states and unknown servers', () =>
    harness.tx(async (db) => {
      const { server } = await fixtures(db);
      const events = new EventBusService();
      const service = new ServerStateService(db, events);
      let emitted = 0;
      events.on('server.started', () => {
        emitted += 1;
      });

      await service.recordState(state(server.id, ServerPowerState.Running));
      await service.recordState(state(server.id, ServerPowerState.Running));
      expect(emitted).toBe(1);

      await service.recordState(
        state('00000000-0000-4000-8000-000000000000', ServerPowerState.Running),
      );
      expect(emitted).toBe(1);
    }));

  it('builds the desired-state snapshot for a node', () =>
    harness.tx(async (db) => {
      const { node, server } = await fixtures(db);
      await db
        .update(servers)
        .set({ status: ServerStatus.Suspended })
        .where(eq(servers.id, server.id));

      const service = new ServerStateService(db, new EventBusService());
      expect(await service.desiredServersFor(node.id)).toEqual([
        { serverId: server.id, autostart: false, suspended: true },
      ]);
    }));
});
