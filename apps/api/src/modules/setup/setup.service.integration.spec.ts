import { afterAll, expect, it } from 'bun:test';
import { UserRole } from '@swifty/sdk';
import { hashToken, TOKEN_PREFIX } from '../../common/crypto';
import type { Database } from '../../db/database.module';
import { createTestHarness, describeDb, expectAppError } from '../../testing/harness';
import { SettingsService } from '../settings/settings.service';
import { PANEL_NAME_KEY, SETUP_CODE_HASH_KEY, SetupService } from './setup.service';

describeDb('SetupService (integration)', () => {
  const harness = createTestHarness();
  afterAll(() => harness.close());

  const CODE = `${TOKEN_PREFIX.Setup}_integration-test-code`;

  async function arm(db: Database): Promise<SetupService> {
    const settings = new SettingsService(db);
    await settings.set(SETUP_CODE_HASH_KEY, hashToken(CODE));
    return new SetupService(db, settings);
  }

  const body = {
    setupCode: CODE,
    panelName: 'Test Panel',
    admin: {
      email: 'admin@test.local',
      username: 'admin',
      password: 'a-long-enough-password',
    },
  };

  it('completes setup once: creates the admin, stores the panel name, flips required', () =>
    harness.tx(async (db) => {
      const setup = await arm(db);
      expect(await setup.isRequired()).toBe(true);

      const admin = await setup.complete(body);
      expect(admin.role).toBe(UserRole.Admin);
      expect(await setup.isRequired()).toBe(false);
      expect(await new SettingsService(db).get<string>(PANEL_NAME_KEY)).toBe('Test Panel');

      await expectAppError(setup.complete(body), 'setup.already_completed');
    }));

  it('rejects a wrong setup code without consuming the active one', () =>
    harness.tx(async (db) => {
      const setup = await arm(db);
      await expectAppError(
        setup.complete({ ...body, setupCode: `${TOKEN_PREFIX.Setup}_wrong` }),
        'setup.invalid_code',
      );
      const admin = await setup.complete(body);
      expect(admin.email).toBe(body.admin.email);
    }));

  it('rejects completion when no code is active', () =>
    harness.tx(async (db) => {
      const setup = new SetupService(db, new SettingsService(db));
      await expectAppError(setup.complete(body), 'setup.no_active_code');
    }));
});
