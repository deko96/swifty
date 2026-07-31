import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../../db/database.module';
import { apiKeys, sessions, users } from '../../db/schema';
import { AppException } from '../app.exception';
import { hashToken, hasTokenPrefix, TOKEN_PREFIX } from '../crypto';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { type AuthenticatedRequest, SESSION_COOKIE } from '../types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // WebSocket connections authenticate at the upgrade (the agent gateway
    // validates node tokens itself); message handlers trust the connection.
    if (context.getType() !== 'http') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const sessionToken = request.cookies?.[SESSION_COOKIE];
    if (typeof sessionToken === 'string' && hasTokenPrefix(sessionToken, TOKEN_PREFIX.Session)) {
      request.user = await this.userFromSession(sessionToken);
      return true;
    }

    const header = request.headers.authorization;
    if (header?.startsWith(`Bearer ${TOKEN_PREFIX.ApiKey}_`)) {
      request.user = await this.userFromApiKey(header.slice('Bearer '.length));
      return true;
    }

    throw new AppException(401, 'auth.unauthenticated', 'Authentication required');
  }

  private async userFromSession(token: string) {
    const [row] = await this.db
      .select({ user: users, session: sessions })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.tokenHash, hashToken(token)))
      .limit(1);

    if (!row || row.session.expiresAt < new Date()) {
      throw new AppException(401, 'auth.session_expired', 'Invalid or expired session');
    }
    return row.user;
  }

  private async userFromApiKey(token: string) {
    const [row] = await this.db
      .select({ user: users, key: apiKeys })
      .from(apiKeys)
      .innerJoin(users, eq(apiKeys.userId, users.id))
      .where(eq(apiKeys.tokenHash, hashToken(token)))
      .limit(1);

    if (!row) {
      throw new AppException(401, 'auth.invalid_api_key', 'Invalid API key');
    }
    void this.db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.key.id));
    return row.user;
  }
}
