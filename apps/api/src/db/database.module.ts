import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import { EnvService } from '../config/env.service';
import * as schema from './schema';

export const DATABASE = Symbol('DATABASE');

export type Database = ReturnType<typeof createDatabase>;

function createDatabase(env: EnvService) {
  const client = new SQL(env.databaseUrl);
  return drizzle({ client, schema });
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [EnvService],
      useFactory: createDatabase,
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(private readonly moduleRef: ModuleRef) {}

  async onApplicationShutdown(): Promise<void> {
    const db = this.moduleRef.get<Database>(DATABASE);
    await db.$client.close();
  }
}
