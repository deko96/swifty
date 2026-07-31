import type { HardwareInventory } from '@swifty/sdk';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const nodes = pgTable('nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull().unique(),
  fqdn: varchar('fqdn', { length: 255 }).notNull(),
  daemonPort: integer('daemon_port').notNull().default(8443),
  tokenEncrypted: text('token_encrypted').notNull(),
  // sha256 of the plaintext token, the agent channel's lookup key; nullable
  // only because rows predating it are backfilled at boot
  tokenHash: varchar('token_hash', { length: 64 }).unique(),
  public: boolean('public').notNull().default(true),
  memoryMb: integer('memory_mb').notNull(),
  diskMb: integer('disk_mb').notNull(),
  daemonVersion: varchar('daemon_version', { length: 32 }),
  inventory: jsonb('inventory').$type<HardwareInventory>(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Node = typeof nodes.$inferSelect;
