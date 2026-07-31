import { afterAll, beforeAll, expect, it } from 'bun:test';
import { ServerStatus, UserRole } from '@swifty/sdk';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/database.module';
import { allocations, nodes, type User, users } from '../../db/schema';
import { createTestHarness, describeDb, expectAppError } from '../../testing/harness';
import { EventBusService } from '../events/event-bus.service';
import { TemplatesService } from '../templates/templates.service';
import { ServersService } from './servers.service';

describeDb('ServersService (integration)', () => {
  const harness = createTestHarness();
  const templates = new TemplatesService();
  beforeAll(() => templates.onModuleInit());
  afterAll(() => harness.close());

  const service = (db: Database) => new ServersService(db, templates, new EventBusService());

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
    const [node] = await db
      .insert(nodes)
      .values({
        name: 'n1',
        fqdn: 'n1.local',
        tokenEncrypted: 'x',
        memoryMb: 16384,
        diskMb: 102400,
      })
      .returning();
    const created = await db
      .insert(allocations)
      .values([
        { nodeId: node!.id, ip: '10.0.0.1', port: 27015 },
        { nodeId: node!.id, ip: '10.0.0.1', port: 27016 },
      ])
      .returning();
    return {
      admin: admin as User,
      owner: owner as User,
      node: node!,
      allocation: created[0]!,
      spare: created[1]!,
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
        .values({ name: 'n2', fqdn: 'n2.local', tokenEncrypted: 'x', memoryMb: 1, diskMb: 1 })
        .returning();
      await expectAppError(
        servers.create({ ...body(f), nodeId: otherNode!.id, allocationId: f.spare.id }),
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
});
