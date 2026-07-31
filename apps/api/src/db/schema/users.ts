import { USER_ROLE_VALUES, UserRole } from '@swifty/sdk';
import { pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', USER_ROLE_VALUES);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 32 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull().default(UserRole.User),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
