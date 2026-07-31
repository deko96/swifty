import { afterAll, afterEach, beforeEach, expect, it } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UserRole } from '@swifty/sdk';
import { hashToken, TOKEN_PREFIX } from '../../../common/crypto';
import type { EnvService } from '../../../config/env.service';
import {
  type DatabaseConnection,
  PANEL_CONFIG_FILE_MODE,
  panelConfigPath,
  readPanelConfig,
} from '../../../config/panel-config';
import type { Database } from '../../../db/database.module';
import { DatabaseHostService } from '../../../db/database-host.service';
import {
  createTestHarness,
  describeDb,
  expectAppError,
  testDatabaseUrl,
} from '../../../testing/harness';
import { SettingsService } from '../../settings/settings.service';
import { PANEL_NAME_KEY, SETUP_CODE_HASH_KEY, SetupService } from '../setup.service';

const CONFIGURED_HOST = { configured: true } as DatabaseHostService;

function envStub(configDir: string): EnvService {
  return { configDir, databaseUrl: undefined } as unknown as EnvService;
}

function testConnectionFields(): DatabaseConnection {
  const url = new URL(testDatabaseUrl as string);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    database: decodeURIComponent(url.pathname.slice(1)),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: false,
  };
}

const completeBody = {
  setupCode: `${TOKEN_PREFIX.Setup}_integration-test-code`,
  panelName: 'Test Panel',
  admin: {
    email: 'admin@test.local',
    username: 'admin',
    password: 'a-long-enough-password',
  },
};

describeDb('SetupService (integration)', () => {
  const harness = createTestHarness();
  afterAll(() => harness.close());

  async function arm(db: Database): Promise<SetupService> {
    const settings = new SettingsService(db);
    await settings.set(SETUP_CODE_HASH_KEY, hashToken(completeBody.setupCode));
    return new SetupService(db, settings, CONFIGURED_HOST, envStub('/unused'));
  }

  it('completes setup once: creates the admin, stores the panel name, flips required', () =>
    harness.tx(async (db) => {
      const setup = await arm(db);
      expect(await setup.isRequired()).toBe(true);

      const admin = await setup.complete(completeBody);
      expect(admin.role).toBe(UserRole.Admin);
      expect(await setup.isRequired()).toBe(false);
      expect(await new SettingsService(db).get<string>(PANEL_NAME_KEY)).toBe('Test Panel');

      await expectAppError(setup.complete(completeBody), 'setup.already_completed');
    }));

  it('rejects a wrong setup code without consuming the active one', () =>
    harness.tx(async (db) => {
      const setup = await arm(db);
      await expectAppError(
        setup.complete({ ...completeBody, setupCode: `${TOKEN_PREFIX.Setup}_wrong` }),
        'setup.invalid_code',
      );
      const admin = await setup.complete(completeBody);
      expect(admin.email).toBe(completeBody.admin.email);
    }));

  it('rejects completion when no code is active', () =>
    harness.tx(async (db) => {
      const setup = new SetupService(
        db,
        new SettingsService(db),
        CONFIGURED_HOST,
        envStub('/unused'),
      );
      await expectAppError(setup.complete(completeBody), 'setup.no_active_code');
    }));

  it('rejects completion while no database is configured', () =>
    harness.tx(async (db) => {
      const setup = new SetupService(
        db,
        new SettingsService(db),
        { configured: false } as DatabaseHostService,
        envStub('/unused'),
      );
      await expectAppError(setup.complete(completeBody), 'setup.database_not_configured');
    }));
});

describeDb('SetupService.configureDatabase (integration)', () => {
  const harness = createTestHarness();
  afterAll(() => harness.close());

  let configDir: string;
  let host: DatabaseHostService;

  beforeEach(async () => {
    configDir = await mkdtemp(join(tmpdir(), 'swifty-config-'));
  });

  afterEach(async () => {
    await host.close();
    await rm(configDir, { recursive: true, force: true });
  });

  function unconfiguredSetup(db: Database): { setup: SetupService; settings: SettingsService } {
    const env = envStub(configDir);
    host = new DatabaseHostService(env);
    const settings = new SettingsService(db);
    return { setup: new SetupService(db, settings, host, env), settings };
  }

  it('tests, persists with mode 0600, connects, migrates, and lets setup complete', () =>
    harness.tx(async (db) => {
      const { setup, settings } = unconfiguredSetup(db);
      expect(setup.isDatabaseConfigured()).toBe(false);
      expect(await setup.isRequired()).toBe(true);

      const code = await setup.issueSetupCode();
      const connection = testConnectionFields();
      const probe = await setup.configureDatabase({ setupCode: code, database: connection });

      expect(probe.ok).toBe(true);
      expect(setup.isDatabaseConfigured()).toBe(true);

      const saved = await readPanelConfig(configDir);
      expect(saved.database).toEqual(connection);
      const mode = (await stat(panelConfigPath(configDir))).mode & 0o777;
      expect(mode).toBe(PANEL_CONFIG_FILE_MODE);

      expect(await settings.get<string>(SETUP_CODE_HASH_KEY)).toBe(hashToken(code));

      const admin = await setup.complete({ ...completeBody, setupCode: code });
      expect(admin.role).toBe(UserRole.Admin);
    }));

  it('rejects a wrong setup code before touching anything', () =>
    harness.tx(async (db) => {
      const { setup } = unconfiguredSetup(db);
      await setup.issueSetupCode();

      await expectAppError(
        setup.configureDatabase({
          setupCode: `${TOKEN_PREFIX.Setup}_wrong`,
          database: testConnectionFields(),
        }),
        'setup.invalid_code',
      );

      expect(setup.isDatabaseConfigured()).toBe(false);
      expect(await readPanelConfig(configDir)).toEqual({});
    }));

  it('rejects an unreachable database without persisting credentials', () =>
    harness.tx(async (db) => {
      const { setup } = unconfiguredSetup(db);
      const code = await setup.issueSetupCode();

      await expectAppError(
        setup.configureDatabase({
          setupCode: code,
          database: { ...testConnectionFields(), host: '127.0.0.1', port: 9 },
        }),
        'setup.database_unreachable',
      );

      expect(setup.isDatabaseConfigured()).toBe(false);
      expect(await readPanelConfig(configDir)).toEqual({});
    }));

  it('refuses to replace an already-configured database', () =>
    harness.tx(async (db) => {
      const { setup } = unconfiguredSetup(db);
      host.connect(testDatabaseUrl as string);

      await expectAppError(
        setup.configureDatabase({
          setupCode: `${TOKEN_PREFIX.Setup}_any`,
          database: testConnectionFields(),
        }),
        'setup.database_already_configured',
      );
    }));
});
