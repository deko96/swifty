import { afterAll, expect, it } from 'bun:test';
import { TokenPurpose } from '@swifty/sdk';
import { eq } from 'drizzle-orm';
import { hashToken, TOKEN_PREFIX } from '../../../common/crypto';
import { oneTimeTokens } from '../../../db/schema';
import { createTestHarness, describeDb } from '../../../testing/harness';
import { TokensService } from '../tokens.service';

describeDb('TokensService (integration)', () => {
  const harness = createTestHarness();
  afterAll(() => harness.close());

  it('issues a hashed token and consumes it exactly once', () =>
    harness.tx(async (db) => {
      const service = new TokensService(db);
      const { token, expiresAt } = await service.issue(TokenPurpose.NodeJoin, 60_000);
      expect(token).toStartWith(`${TOKEN_PREFIX.NodeJoin}_`);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

      const [row] = await db
        .select()
        .from(oneTimeTokens)
        .where(eq(oneTimeTokens.tokenHash, hashToken(token)));
      expect(row?.purpose).toBe(TokenPurpose.NodeJoin);

      expect(await service.consume(TokenPurpose.NodeJoin, token)).toBe(true);
      expect(await service.consume(TokenPurpose.NodeJoin, token)).toBe(false);
    }));

  it('rejects unknown and expired tokens', () =>
    harness.tx(async (db) => {
      const service = new TokensService(db);
      expect(await service.consume(TokenPurpose.NodeJoin, `${TOKEN_PREFIX.NodeJoin}_nope`)).toBe(
        false,
      );

      const { token } = await service.issue(TokenPurpose.NodeJoin, 60_000);
      await db
        .update(oneTimeTokens)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(oneTimeTokens.tokenHash, hashToken(token)));
      expect(await service.consume(TokenPurpose.NodeJoin, token)).toBe(false);
    }));
});
