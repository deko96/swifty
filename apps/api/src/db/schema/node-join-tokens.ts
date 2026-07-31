import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * One-time tokens that let a fresh daemon register itself as a node. Only
 * the SHA-256 hash is stored; a token is spent the moment it registers.
 */
export const nodeJoinTokens = pgTable('node_join_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type NodeJoinToken = typeof nodeJoinTokens.$inferSelect;
