import { boolean, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const nodes = pgTable('nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull().unique(),
  fqdn: varchar('fqdn', { length: 255 }).notNull(),
  daemonPort: integer('daemon_port').notNull().default(8443),
  tokenEncrypted: text('token_encrypted').notNull(),
  public: boolean('public').notNull().default(true),
  memoryMb: integer('memory_mb').notNull(),
  diskMb: integer('disk_mb').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Node = typeof nodes.$inferSelect;
