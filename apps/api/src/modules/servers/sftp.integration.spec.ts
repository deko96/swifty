import { afterAll, beforeAll, expect, it } from 'bun:test';
import { UserRole } from '@swifty/sdk';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/database.module';
import { allocations, nodes, servers, users } from '../../db/schema';
import { createTestHarness, describeDb, expectAppError, mustExist } from '../../testing/harness';
import { EventBusService } from '../events/event-bus.service';
import { TemplatesService } from '../templates/templates.service';
import { ServersService } from './servers.service';

describeDb('ServersService SFTP (integration)', () => {
  const harness = createTestHarness();
  const templates = new TemplatesService();
  beforeAll(() => templates.onModuleInit());
  afterAll(() => harness.close());

  const service = (db: Database) => new ServersService(db, templates, new EventBusService());

  async function seed(db: Database) {
    const [ownerRow] = await db
      .insert(users)
      .values({ email: 'owner@t.local', username: 'owner', passwordHash: 'x' })
      .returning();
    const owner = mustExist(ownerRow);
    const [nodeRow] = await db
      .insert(nodes)
      .values({
        name: 'n1',
        fqdn: 'node1.example.com',
        tokenEncrypted: 'x',
        memoryMb: 16384,
        diskMb: 102400,
      })
      .returning();
    const node = mustExist(nodeRow);
    const [alloc] = await db
      .insert(allocations)
      .values({ nodeId: node.id, ip: '10.0.0.1', port: 27015 })
      .returning();

    const svc = service(db);
    const { server } = await svc.create({
      name: 'cs',
      ownerId: owner.id,
      nodeId: node.id,
      allocationId: mustExist(alloc).id,
      templateId: 'counter-strike-16',
      cpuPercent: 100,
      memoryMb: 1024,
      diskMb: 10240,
      env: {},
    });
    return { svc, owner, node, server };
  }

  it('assigns a stable SFTP username at creation, no password yet', () =>
    harness.tx(async (db) => {
      const { server, node, owner, svc } = await seed(db);
      expect(server.sftpUsername).toStartWith('srv_');
      expect(server.sftpPasswordHash).toBeNull();

      const info = svc.sftpInfo(owner, server, node);
      expect(info).toEqual({
        host: 'node1.example.com',
        port: 2022,
        username: server.sftpUsername,
      });
    }));

  it('rotate returns a one-time password and stores only its hash', () =>
    harness.tx(async (db) => {
      const { server, owner, svc } = await seed(db);
      const { info, password } = await svc.rotateSftpPassword(owner, server.id);

      expect(info.username).toBe(server.sftpUsername);
      expect(password.length).toBeGreaterThanOrEqual(20);

      const [row] = await db.select().from(servers).where(eq(servers.id, server.id));
      expect(row?.sftpPasswordHash).toBeTruthy();
      expect(row?.sftpPasswordHash).not.toContain(password);
    }));

  it('verifies correct credentials and rejects everything else', () =>
    harness.tx(async (db) => {
      const { server, owner, svc } = await seed(db);

      expect(await svc.verifySftp(server.sftpUsername, 'anything')).toBeNull();

      const { password } = await svc.rotateSftpPassword(owner, server.id);
      expect(await svc.verifySftp(server.sftpUsername, password)).toEqual({ serverId: server.id });
      expect(await svc.verifySftp(server.sftpUsername, 'wrong')).toBeNull();
      expect(await svc.verifySftp('srv_unknown', password)).toBeNull();
    }));

  it('rotating invalidates the previous password', () =>
    harness.tx(async (db) => {
      const { server, owner, svc } = await seed(db);
      const first = await svc.rotateSftpPassword(owner, server.id);
      const second = await svc.rotateSftpPassword(owner, server.id);

      expect(await svc.verifySftp(server.sftpUsername, first.password)).toBeNull();
      expect(await svc.verifySftp(server.sftpUsername, second.password)).toEqual({
        serverId: server.id,
      });
    }));

  it('denies rotation to a non-owner non-admin', () =>
    harness.tx(async (db) => {
      const { server, svc } = await seed(db);
      const [stranger] = await db
        .insert(users)
        .values({ email: 's@t.local', username: 'stranger', passwordHash: 'x' })
        .returning();
      await expectAppError(
        svc.rotateSftpPassword(mustExist(stranger), server.id),
        'servers.not_found',
      );
    }));

  it('allows an admin to rotate any server', () =>
    harness.tx(async (db) => {
      const { server, svc } = await seed(db);
      const [admin] = await db
        .insert(users)
        .values({ email: 'a@t.local', username: 'admin', passwordHash: 'x', role: UserRole.Admin })
        .returning();
      const { password } = await svc.rotateSftpPassword(mustExist(admin), server.id);
      expect(await svc.verifySftp(server.sftpUsername, password)).toEqual({ serverId: server.id });
    }));
});
