import { boolean, integer, pgTable, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { nodes } from './nodes';
import { servers } from './servers';

export const allocations = pgTable(
  'allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    ip: varchar('ip', { length: 45 }).notNull(),
    port: integer('port').notNull(),
    serverId: uuid('server_id').references(() => servers.id, { onDelete: 'set null' }),
    primary: boolean('primary').notNull().default(false),
  },
  (table) => [unique().on(table.nodeId, table.ip, table.port)],
);

export type Allocation = typeof allocations.$inferSelect;
