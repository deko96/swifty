import { afterAll, expect, it } from 'bun:test';
import { UserRole } from '@swifty/sdk';
import type { Database } from '../../db/database.module';
import { createTestHarness, describeDb, expectAppError } from '../../testing/harness';
import { EventBusService } from '../events/event-bus.service';
import { UsersService } from './users.service';

describeDb('UsersService (integration)', () => {
  const harness = createTestHarness();
  afterAll(() => harness.close());

  const service = (db: Database) => new UsersService(db, new EventBusService());

  const admin = {
    email: 'admin@test.local',
    username: 'admin',
    password: 'a-long-enough-password',
    role: UserRole.Admin,
  };

  it('creates and fetches a user with a hashed password', () =>
    harness.tx(async (db) => {
      const users = service(db);
      const created = await users.create(admin);
      expect(created.passwordHash).not.toContain(admin.password);
      expect(await Bun.password.verify(admin.password, created.passwordHash)).toBe(true);
      expect((await users.findById(created.id)).email).toBe(admin.email);
    }));

  it('rejects duplicate email and username with distinct codes', () =>
    harness.tx(async (db) => {
      const users = service(db);
      await users.create(admin);
      await expectAppError(users.create({ ...admin, username: 'other' }), 'users.email_taken');
      await expectAppError(
        users.create({ ...admin, email: 'other@test.local' }),
        'users.username_taken',
      );
    }));

  it('refuses to delete the last admin but allows deleting one of two', () =>
    harness.tx(async (db) => {
      const users = service(db);
      const first = await users.create(admin);
      await expectAppError(users.delete(first.id), 'users.last_admin');

      const second = await users.create({
        ...admin,
        email: 'second@test.local',
        username: 'second',
      });
      await users.delete(second.id);
      await expectAppError(users.findById(second.id), 'users.not_found');
    }));

  it('reports users.not_found for unknown ids', () =>
    harness.tx(async (db) => {
      await expectAppError(
        service(db).findById('00000000-0000-0000-0000-000000000000'),
        'users.not_found',
      );
    }));
});
