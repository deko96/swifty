import {
  SERVER_POWER_STATE_VALUES,
  SERVER_STATUS_VALUES,
  ServerPowerState,
  ServerStatus,
} from '@swifty/sdk';
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { nodes } from './nodes';
import { users } from './users';

export const serverStatus = pgEnum('server_status', SERVER_STATUS_VALUES);
export const serverPowerState = pgEnum('server_power_state', SERVER_POWER_STATE_VALUES);

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
  powerState: serverPowerState('power_state').notNull().default(ServerPowerState.Offline),
  powerStateChangedAt: timestamp('power_state_changed_at', { withTimezone: true }),
  lastExitCode: integer('last_exit_code'),
  cpuPercent: integer('cpu_percent').notNull(),
  memoryMb: integer('memory_mb').notNull(),
  diskMb: integer('disk_mb').notNull(),
  env: jsonb('env').$type<Record<string, string>>().notNull().default({}),
  sftpUsername: varchar('sftp_username', { length: 40 }).notNull().unique(),
  sftpPasswordHash: text('sftp_password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Server = typeof servers.$inferSelect;
