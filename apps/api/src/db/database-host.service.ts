import { join } from 'node:path';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { AppException } from '../common/app.exception';
import { EnvService } from '../config/env.service';
import { panelDatabaseUrl, readPanelConfig } from '../config/panel-config';
import * as schema from './schema';

export const MIGRATIONS_FOLDER = join(import.meta.dir, '..', '..', 'drizzle');

export function createDatabase(url: string) {
  const client = new SQL(url);
  return drizzle({ client, schema });
}

export type Database = ReturnType<typeof createDatabase>;

/**
 * Owns the panel's database connection. Normally it connects at boot from
 * DATABASE_URL or the wizard-written config file; when neither exists the
 * panel stays up unconfigured so the setup wizard can supply credentials.
 */
@Injectable()
export class DatabaseHostService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseHostService.name);
  private db: Database | null = null;

  constructor(private readonly env: EnvService) {}

  async onModuleInit(): Promise<void> {
    const url = this.env.databaseUrl ?? (await this.configuredUrl());
    if (url) {
      this.connect(url);
      return;
    }
    this.logger.warn('No database configured — the setup wizard will ask for one.');
  }

  private async configuredUrl(): Promise<string | undefined> {
    const config = await readPanelConfig(this.env.configDir);
    return config.database && panelDatabaseUrl(config.database);
  }

  get configured(): boolean {
    return this.db !== null;
  }

  get database(): Database {
    if (!this.db) {
      throw new AppException(
        409,
        'setup.database_not_configured',
        'No database is configured yet — complete the database step of the setup wizard',
      );
    }
    return this.db;
  }

  connect(url: string): void {
    this.db = createDatabase(url);
  }

  async migrate(): Promise<void> {
    await migrate(this.database, { migrationsFolder: MIGRATIONS_FOLDER });
  }

  async close(): Promise<void> {
    if (!this.db) {
      return;
    }
    const client = this.db.$client;
    this.db = null;
    await client.close();
  }
}
