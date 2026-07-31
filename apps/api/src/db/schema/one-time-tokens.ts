import { TOKEN_PURPOSE_VALUES } from '@swifty/sdk';
import { pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const tokenPurpose = pgEnum('token_purpose', TOKEN_PURPOSE_VALUES);

/**
 * Single-use credentials, such as the token a fresh daemon exchanges to
 * register itself as a node. Only the SHA-256 hash is stored; a token is
 * spent the moment it is consumed and is only valid for its purpose.
 */
export const oneTimeTokens = pgTable('one_time_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  purpose: tokenPurpose('purpose').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type OneTimeToken = typeof oneTimeTokens.$inferSelect;
