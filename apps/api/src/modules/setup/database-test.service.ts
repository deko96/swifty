import { Injectable } from '@nestjs/common';
import { SQL } from 'bun';
import { EnvService } from '../../config/env.service';
import type { DatabaseTestResponse } from './setup.schemas';

export const DB_DIAL_TIMEOUT_S = 5;
export const REQUIRED_ENCODING = 'UTF8';
const MIGRATION_SCHEMA = 'public';

@Injectable()
export class DatabaseTestService {
  constructor(private readonly env: EnvService) {}

  async run(): Promise<DatabaseTestResponse> {
    return testConnection(this.env.databaseUrl);
  }
}

/**
 * Dials a fresh connection instead of reusing the app pool so the result
 * reflects what a migration run would see right now.
 */
export async function testConnection(databaseUrl: string): Promise<DatabaseTestResponse> {
  const sql = new SQL(databaseUrl, { connectionTimeout: DB_DIAL_TIMEOUT_S });
  try {
    const [row] = (await sql`
      select
        version() as version,
        current_setting('server_encoding') as encoding,
        has_schema_privilege(current_user, ${MIGRATION_SCHEMA}, 'CREATE') as "canCreate"
    `) as [{ version: string; encoding: string; canCreate: boolean }];

    return {
      ok: row.encoding === REQUIRED_ENCODING && row.canCreate,
      version: row.version,
      encoding: row.encoding,
      canCreate: row.canCreate,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      version: null,
      encoding: null,
      canCreate: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await sql.close().catch(() => {});
  }
}
