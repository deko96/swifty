import { Inject, Injectable } from '@nestjs/common';
import { TokenPurpose } from '@swifty/sdk';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { generateToken, hashToken, TOKEN_PREFIX, type TokenPrefix } from '../../common/crypto';
import { DATABASE, type Database } from '../../db/database.module';
import { oneTimeTokens } from '../../db/schema';

const PURPOSE_PREFIX: Record<TokenPurpose, TokenPrefix> = {
  [TokenPurpose.NodeJoin]: TOKEN_PREFIX.NodeJoin,
};

@Injectable()
export class TokensService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async issue(purpose: TokenPurpose, ttlMs: number): Promise<{ token: string; expiresAt: Date }> {
    const token = generateToken(PURPOSE_PREFIX[purpose]);
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.db.insert(oneTimeTokens).values({ tokenHash: hashToken(token), purpose, expiresAt });
    return { token, expiresAt };
  }

  /**
   * Atomically marks the token as used; false when it is unknown, expired,
   * already used, or was issued for another purpose. Callers decide what
   * error that means — pass their transaction to spend within it.
   */
  async consume(
    purpose: TokenPurpose,
    token: string,
    executor: Pick<Database, 'update'> = this.db,
  ): Promise<boolean> {
    const now = new Date();
    const [spent] = await executor
      .update(oneTimeTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(oneTimeTokens.tokenHash, hashToken(token)),
          eq(oneTimeTokens.purpose, purpose),
          isNull(oneTimeTokens.usedAt),
          gt(oneTimeTokens.expiresAt, now),
        ),
      )
      .returning();
    return spent !== undefined;
  }
}
