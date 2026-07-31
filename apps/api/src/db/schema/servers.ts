import { SERVER_STATUS_VALUES, ServerStatus } from '@swifty/sdk';
import { integer, jsonb, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { nodes } from './nodes';
import { users } from './users';

export const serverStatus = pgEnum('server_status', SERVER_STATUS_VALUES);

export const servers = pgTable('servers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  nodeId: uuid('node_id')
    .notNull()
    .references(() => nodes.id, { onDelete: 'restrict' }),
  templateId: varchar('template_id', { length: 64 }).notNull(),
  status: serverStatus('status').notNull().default(ServerStatus.Installing),
  cpuPercent: integer('cpu_percent').notNull(),
  memoryMb: integer('memory_mb').notNull(),
  diskMb: integer('disk_mb').notNull(),
  env: jsonb('env').$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Server = typeof servers.$inferSelect;
