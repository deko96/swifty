import { afterAll, beforeAll, expect, it } from 'bun:test';
import { AgentCommands, PowerAction, ServerStatus, UserRole } from '@swifty/sdk';
import { eq } from 'drizzle-orm';
import type { Database } from '../../../db/database.module';
import { allocations, nodes, servers, users } from '../../../db/schema';
import { createTestHarness, describeDb, expectAppError, mustExist } from '../../../testing/harness';
import { AgentRegistry } from '../../agent-gateway/agent.registry';
import { AgentGatewayService } from '../../agent-gateway/agent-gateway.service';
import { EventBusService } from '../../events/event-bus.service';
import { TemplatesService } from '../../templates/templates.service';
import { DEFAULT_PIDS_LIMIT, ServersService } from '../servers.service';

describeDb('ServersService (integration)', () => {
  const harness = createTestHarness();
  const templates = new TemplatesService();
  beforeAll(() => templates.onModuleInit());
  afterAll(() => harness.close());

  const service = (db: Database) =>
    new ServersService(
      db,
      templates,
      new EventBusService(),
      new AgentGatewayService(new AgentRegistry()),
    );

  async function fixtures(db: Database) {
    const [admin] = await db
      .insert(users)
      .values({
        email: 'admin@t.local',
        username: 'admin',
        passwordHash: 'x',
        role: UserRole.Admin,
      })
      .returning();
    const [owner] = await db
      .insert(users)
      .values({ email: 'owner@t.local', username: 'owner', passwordHash: 'x' })
      .returning();
    const [nodeRow] = await db
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
    const node = mustExist(nodeRow);
    const created = await db
      .insert(allocations)
      .values([
        { nodeId: node.id, ip: '10.0.0.1', port: 27015 },
        { nodeId: node.id, ip: '10.0.0.1', port: 27016 },
      ])
      .returning();
    return {
      admin: mustExist(admin),
      owner: mustExist(owner),
      node,
      allocation: mustExist(created[0]),
      spare: mustExist(created[1]),
    };
  }

  const body = (f: Awaited<ReturnType<typeof fixtures>>) => ({
    name: 'cs 1.6 #1',
    ownerId: f.owner.id,
    nodeId: f.node.id,
    allocationId: f.allocation.id,
    templateId: 'counter-strike-16',
    cpuPercent: 100,
    memoryMb: 1024,
    diskMb: 10240,
    env: {},
  });

  it('creates a server, claims the allocation, and resolves default variables', () =>
    harness.tx(async (db) => {
      const f = await fixtures(db);
      const { server, allocation } = await service(db).create(body(f));

      expect(server.status).toBe(ServerStatus.Installing);
      expect(server.env.MAX_PLAYERS).toBe('32');
      expect(server.env.DEFAULT_MAP).toBe('de_dust2');
      expect(allocation?.id).toBe(f.allocation.id);

      const [claimed] = await db
        .select()
        .from(allocations)
        .where(eq(allocations.id, f.allocation.id));
      expect(claimed?.serverId).toBe(server.id);
      expect(claimed?.primary).toBe(true);
    }));

  it('validates provided variables against template rules', () =>
    harness.tx(async (db) => {
      const f = await fixtures(db);
      await expectAppError(
        service(db).create({ ...body(f), env: { MAX_PLAYERS: 99 } }),
        'validation.failed',
      );
      await expectAppError(
        service(db).create({ ...body(f), env: { BOGUS: 'x' } }),
        'validation.failed',
      );
    }));

  it('rejects unknown templates and unavailable allocations', () =>
    harness.tx(async (db) => {
      const f = await fixtures(db);
      const servers = service(db);
      await expectAppError(
        servers.create({ ...body(f), templateId: 'quake-9' }),
        'templates.not_found',
      );

      await servers.create(body(f));
      await expectAppError(servers.create(body(f)), 'allocations.not_available');

      const [otherNode] = await db
        .insert(nodes)
        .values({
          name: 'n2',
          fqdn: 'n2.local',
          tokenEncrypted: 'x',
          tokenHash: 'x2',
          memoryMb: 1,
          diskMb: 1,
        })
        .returning();
      await expectAppError(
        servers.create({ ...body(f), nodeId: mustExist(otherNode).id, allocationId: f.spare.id }),
        'allocations.not_available',
      );
    }));

  it('scopes visibility to the owner unless admin', () =>
    harness.tx(async (db) => {
      const f = await fixtures(db);
      const servers = service(db);
      const { server } = await servers.create(body(f));

      expect((await servers.listFor(f.admin)).map((s) => s.server.id)).toEqual([server.id]);
      expect((await servers.listFor(f.owner)).map((s) => s.server.id)).toEqual([server.id]);
      expect(
        await servers.listFor({ ...f.admin, id: f.owner.id, role: UserRole.User }),
      ).toHaveLength(1);

      const stranger = { ...f.owner, id: f.admin.id, role: UserRole.User };
      await expectAppError(servers.findFor(stranger, server.id), 'servers.not_found');
      expect((await servers.findFor(f.admin, server.id)).server.id).toBe(server.id);
    }));

  it('merges env updates and keeps untouched values', () =>
    harness.tx(async (db) => {
      const f = await fixtures(db);
      const servers = service(db);
      const { server } = await servers.create({ ...body(f), env: { MAX_PLAYERS: 16 } });

      const updated = await servers.update(server.id, { env: { DEFAULT_MAP: 'de_inferno' } });
      expect(updated.server.env.MAX_PLAYERS).toBe('16');
      expect(updated.server.env.DEFAULT_MAP).toBe('de_inferno');

      await expectAppError(
        servers.update(server.id, { env: { MAX_PLAYERS: 'many' } }),
        'validation.failed',
      );
    }));

  it('delete frees the allocation and clears the primary flag', () =>
    harness.tx(async (db) => {
      const f = await fixtures(db);
      const servers = service(db);
      const { server } = await servers.create(body(f));

      await servers.delete(server.id);
      const [freed] = await db
        .select()
        .from(allocations)
        .where(eq(allocations.id, f.allocation.id));
      expect(freed?.serverId).toBeNull();
      expect(freed?.primary).toBe(false);
      await expectAppError(servers.findFor(f.admin, server.id), 'servers.not_found');
      await expectAppError(servers.delete(server.id), 'servers.not_found');
    }));

  interface SentCommand {
    nodeId: string;
    event: string;
    payload: Record<string, unknown>;
  }

  function fakeAgents(sent: SentCommand[], ok = true, error?: string): AgentGatewayService {
    return {
      sendCommand: async (nodeId: string, event: string, payload: Record<string, unknown>) => {
        sent.push({ nodeId, event, payload });
        return { v: 1, id: 'reply', commandId: 'cmd', ok, ...(error ? { error } : {}) };
      },
    } as unknown as AgentGatewayService;
  }

  const powerService = (db: Database, agents: AgentGatewayService) =>
    new ServersService(db, templates, new EventBusService(), agents);

  it('start dispatches the rendered command, env, and limits to the node', () =>
    harness.tx(async (db) => {
      const f = await fixtures(db);
      const sent: SentCommand[] = [];
      const servers_ = powerService(db, fakeAgents(sent));
      const { server } = await servers_.create(body(f));
      await db
        .update(servers)
        .set({ status: ServerStatus.Installed })
        .where(eq(servers.id, server.id));

      await servers_.power(f.owner, server.id, PowerAction.Start);

      expect(sent).toHaveLength(1);
      const command = mustExist(sent[0]);
      expect(command.nodeId).toBe(f.node.id);
      expect(command.event).toBe(AgentCommands.Power);
      expect(command.payload.action).toBe(PowerAction.Start);
      const argv = command.payload.command as string[];
      expect(argv[0]).toBe('./hlds_run');
      expect(argv).toContain('10.0.0.1');
      expect(argv).toContain('27015');
      expect(command.payload.limits).toEqual({
        cpuPercent: 100,
        memoryMiB: 1024,
        diskMiB: 10240,
        pids: DEFAULT_PIDS_LIMIT,
      });
    }));

  it('stop dispatches without a start payload', () =>
    harness.tx(async (db) => {
      const f = await fixtures(db);
      const sent: SentCommand[] = [];
      const servers_ = powerService(db, fakeAgents(sent));
      const { server } = await servers_.create(body(f));

      await servers_.power(f.owner, server.id, PowerAction.Stop);

      const command = mustExist(sent[0]);
      expect(command.payload.command).toBeUndefined();
      expect(command.payload.limits).toBeUndefined();
    }));

  it('refuses to start suspended or not-yet-installed servers', () =>
    harness.tx(async (db) => {
      const f = await fixtures(db);
      const sent: SentCommand[] = [];
      const servers_ = powerService(db, fakeAgents(sent));
      const { server } = await servers_.create(body(f));

      await expectAppError(
        servers_.power(f.owner, server.id, PowerAction.Start),
        'servers.not_installed',
      );
      await db
        .update(servers)
        .set({ status: ServerStatus.Suspended })
        .where(eq(servers.id, server.id));
      await expectAppError(
        servers_.power(f.owner, server.id, PowerAction.Restart),
        'servers.suspended',
      );
      expect(sent).toHaveLength(0);
    }));

  it('surfaces a rejected power action as servers.power_failed', () =>
    harness.tx(async (db) => {
      const f = await fixtures(db);
      const servers_ = powerService(db, fakeAgents([], false, 'unit is masked'));
      const { server } = await servers_.create(body(f));

      await expectAppError(
        servers_.power(f.owner, server.id, PowerAction.Kill),
        'servers.power_failed',
      );
    }));
});
