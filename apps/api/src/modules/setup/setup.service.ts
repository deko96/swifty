import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { UserRole } from '@swifty/sdk';
import { eq } from 'drizzle-orm';
import { AppException } from '../../common/app.exception';
import { generateToken, hashToken, TOKEN_PREFIX } from '../../common/crypto';
import { DATABASE, type Database } from '../../db/database.module';
import { type User, users } from '../../db/schema';
import { SettingsService } from '../settings/settings.service';
import type { CompleteSetupBody } from './setup.schemas';

export const PANEL_NAME_KEY = 'panel.name';
export const SETUP_CODE_HASH_KEY = 'setup.code_hash';

@Injectable()
export class SetupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SetupService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly settings: SettingsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!(await this.isRequired())) {
      return;
    }
    const code = generateToken(TOKEN_PREFIX.Setup);
    await this.settings.set(SETUP_CODE_HASH_KEY, hashToken(code));
    this.logger.warn('Panel is not set up yet — open it in your browser to run the setup wizard.');
    this.logger.warn(`One-time setup code: ${code}`);
  }

  async isRequired(): Promise<boolean> {
    const [admin] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, UserRole.Admin))
      .limit(1);
    return admin === undefined;
  }

  async complete(body: CompleteSetupBody): Promise<User> {
    if (!(await this.isRequired())) {
      throw new AppException(409, 'setup.already_completed', 'Setup has already been completed');
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
