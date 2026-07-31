import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { UserRole } from '@swifty/sdk';
import { eq } from 'drizzle-orm';
import { AppException } from '../../common/app.exception';
import { generateToken, hashToken, TOKEN_PREFIX } from '../../common/crypto';
import { EnvService } from '../../config/env.service';
import { panelConfigPath, panelDatabaseUrl, writePanelConfig } from '../../config/panel-config';
import { DATABASE, type Database } from '../../db/database.module';
import { DatabaseHostService } from '../../db/database-host.service';
import { type User, users } from '../../db/schema';
import { SettingsService } from '../settings/settings.service';
import { REQUIRED_ENCODING, testConnection } from './database-test.service';
import type { CompleteSetupBody, DatabaseSetupBody, DatabaseTestResponse } from './setup.schemas';

export const PANEL_NAME_KEY = 'panel.name';
export const SETUP_CODE_HASH_KEY = 'setup.code_hash';

@Injectable()
export class SetupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SetupService.name);
  private pendingCodeHash: string | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly settings: SettingsService,
    private readonly dbHost: DatabaseHostService,
    private readonly env: EnvService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!(await this.isRequired())) {
      return;
    }
    const code = await this.issueSetupCode();
    this.logger.warn('Panel is not set up yet — open it in your browser to run the setup wizard.');
    this.logger.warn(`One-time setup code: ${code}`);
  }

  /**
   * The hash lives in the settings table once a database exists; before one
   * does it can only live in memory, so a restart prints a fresh code.
   */
  async issueSetupCode(): Promise<string> {
    const code = generateToken(TOKEN_PREFIX.Setup);
    const hash = hashToken(code);
    if (this.dbHost.configured) {
      await this.settings.set(SETUP_CODE_HASH_KEY, hash);
    } else {
      this.pendingCodeHash = hash;
    }
    return code;
  }

  async isRequired(): Promise<boolean> {
    if (!this.dbHost.configured) {
      return true;
    }
    const [admin] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, UserRole.Admin))
      .limit(1);
    return admin === undefined;
  }

  isDatabaseConfigured(): boolean {
    return this.dbHost.configured;
  }

  async ensurePending(): Promise<void> {
    if (!(await this.isRequired())) {
      throw new AppException(409, 'setup.already_completed', 'Setup has already been completed');
    }
  }

  async verifyCode(code: string): Promise<void> {
    const hash = this.dbHost.configured
      ? await this.settings.get<string>(SETUP_CODE_HASH_KEY)
      : (this.pendingCodeHash ?? undefined);
    if (!hash) {
      throw new AppException(
        403,
        'setup.no_active_code',
        'No setup code is active; restart the panel to generate one',
      );
    }
    if (hashToken(code) !== hash) {
      throw new AppException(403, 'setup.invalid_code', 'Invalid setup code');
    }
  }

  async configureDatabase(body: DatabaseSetupBody): Promise<DatabaseTestResponse> {
    await this.ensurePending();
    if (this.dbHost.configured) {
      throw new AppException(
        409,
        'setup.database_already_configured',
        'The panel already has a working database',
      );
    }
    await this.verifyCode(body.setupCode);

    const url = panelDatabaseUrl(body.database);
    const probe = await testConnection(url);
    if (!probe.ok) {
      throw new AppException(422, 'setup.database_unreachable', unusableDetail(probe));
    }

    await writePanelConfig({ database: body.database }, this.env.configDir);
    this.dbHost.connect(url);
    try {
      await this.dbHost.migrate();
    } catch (error) {
      await this.dbHost.close();
      throw new AppException(
        500,
        'setup.migration_failed',
        `Migrations failed against the provided database: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (this.pendingCodeHash) {
      await this.settings.set(SETUP_CODE_HASH_KEY, this.pendingCodeHash);
      this.pendingCodeHash = null;
    }
    this.logger.log(
      `Database configured — credentials saved to ${panelConfigPath(this.env.configDir)}`,
    );
    return probe;
  }

  async complete(body: CompleteSetupBody): Promise<User> {
    await this.ensurePending();
    if (!this.dbHost.configured) {
      throw new AppException(
        409,
        'setup.database_not_configured',
        'No database is configured yet — complete the database step of the setup wizard',
      );
    }

    const codeHash = await this.settings.get<string>(SETUP_CODE_HASH_KEY);
    if (!codeHash) {
      throw new AppException(
        403,
        'setup.no_active_code',
        'No setup code is active; restart the panel to generate one',
      );
    }
    if (hashToken(body.setupCode) !== codeHash) {
      throw new AppException(403, 'setup.invalid_code', 'Invalid setup code');
    }

    // Consuming the code first makes it single-use even under concurrent requests.
    const consumed = await this.settings.delete(SETUP_CODE_HASH_KEY);
    if (!consumed) {
      throw new AppException(409, 'setup.already_completed', 'Setup is already being completed');
    }

    const [admin] = await this.db
      .insert(users)
      .values({
        email: body.admin.email,
        username: body.admin.username,
        passwordHash: await Bun.password.hash(body.admin.password, 'argon2id'),
        role: UserRole.Admin,
      })
      .returning();
    if (!admin) {
      throw new Error('Insert returned no row');
    }

    await this.settings.set(PANEL_NAME_KEY, body.panelName);
    this.logger.log(`Setup completed — panel "${body.panelName}", admin ${admin.email}`);
    return admin;
  }
}

function unusableDetail(probe: DatabaseTestResponse): string {
  if (probe.error) {
    return probe.error;
  }
  const problems: string[] = [];
  if (probe.encoding !== null && probe.encoding !== REQUIRED_ENCODING) {
    problems.push(`server encoding is ${probe.encoding}, the panel requires ${REQUIRED_ENCODING}`);
  }
  if (probe.canCreate === false) {
    problems.push('the database user may not create tables');
  }
  return `Database is reachable but not usable: ${problems.join('; ')}`;
}
