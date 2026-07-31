import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDatabase, type Database, DatabaseHostService } from './database-host.service';

export const DATABASE = Symbol('DATABASE');

export type { Database } from './database-host.service';

/**
 * Stands in for the real drizzle instance so consumers can inject DATABASE
 * before setup has provided credentials. While unconfigured, reads of actual
 * drizzle members throw `setup.database_not_configured`; anything else (Nest
 * lifecycle-hook probes, `await`'s `then` lookup, inspection symbols) returns
 * undefined, decided against a shape instance that never opens a connection —
 * Bun's SQL client only dials on first query.
 */
function createDatabaseProxy(host: DatabaseHostService): Database {
  const shape = createDatabase('postgres://unconfigured') as object;
  return new Proxy({} as Database, {
    get(_target, property) {
      if (!host.configured && !(property in shape)) {
        return undefined;
      }
      const db = host.database;
      const value = Reflect.get(db as object, property, db);
      return typeof value === 'function' ? value.bind(db) : value;
    },
    has(_target, property) {
      return property in ((host.configured ? host.database : shape) as object);
    },
  });
}

@Global()
@Module({
  providers: [
    DatabaseHostService,
    {
      provide: DATABASE,
      inject: [DatabaseHostService],
      useFactory: createDatabaseProxy,
    },
  ],
  exports: [DATABASE, DatabaseHostService],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(private readonly host: DatabaseHostService) {}

  async onApplicationShutdown(): Promise<void> {
    await this.host.close();
  }
}
