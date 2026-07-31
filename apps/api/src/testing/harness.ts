import { describe, expect } from 'bun:test';
import type { ErrorCode } from '@swifty/sdk';
import { SQL } from 'bun';
import { getTableName, is, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { PgTable } from 'drizzle-orm/pg-core';
import { AppException } from '../common/app.exception';
import type { Database } from '../db/database.module';
import * as schema from '../db/schema';

const tableNames = Object.values(schema)
  .filter((value) => is(value, PgTable))
  .map((table) => `"${getTableName(table as PgTable)}"`)
  .join(', ');

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

/**
 * Integration suites declare themselves with describeDb: they run against the
 * database from TEST_DATABASE_URL or DATABASE_URL and are skipped entirely
 * when neither is set (CI always sets one).
 */
export const describeDb = url ? describe : describe.skip;

/** The URL describeDb suites run against; undefined when they are skipped. */
export const testDatabaseUrl = url;

class Rollback extends Error {}

export interface TestHarness {
  /** Runs fn inside a transaction that is always rolled back. */
  tx(fn: (db: Database) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}

export function createTestHarness(): TestHarness {
  if (!url) {
    // describe.skip still executes the suite callback, so harness creation
    // must not throw; tx never runs because every test is skipped.
    return {
      tx: () => Promise.reject(new Error('No test database configured')),
      close: () => Promise.resolve(),
    };
  }
  const client = new SQL(url);
  const db = drizzle({ client, schema });
  let migrated = false;

  return {
    async tx(fn) {
      if (!migrated) {
        await migrate(db, { migrationsFolder: `${import.meta.dir}/../../drizzle` });
        migrated = true;
      }
      try {
        await db.transaction(async (tx) => {
          // Transactional in Postgres: the rollback below restores the data,
          // so tests get empty tables without destroying a dev database.
          await tx.execute(sql.raw(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`));
          await fn(tx as unknown as Database);
          throw new Rollback();
        });
      } catch (error) {
        if (!(error instanceof Rollback)) {
          throw error;
        }
      }
    },
    async close() {
      await client.close();
    },
  };
}

export function mustExist<T>(value: T | undefined | null): T {
  if (value == null) {
    throw new Error('Expected fixture row to exist');
  }
  return value;
}

export async function expectAppError(promise: Promise<unknown>, code: ErrorCode): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(code);
    return;
  }
  throw new Error(`Expected AppException with code ${code}, but nothing was thrown`);
}
