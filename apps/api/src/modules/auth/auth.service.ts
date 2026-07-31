import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { generateToken, hashToken } from '../../common/crypto';
import { DATABASE, type Database } from '../../db/database.module';
import { sessions, type User, users } from '../../db/schema';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async login(
    email: string,
    password: string,
    meta: SessionMeta,
  ): Promise<{ user: User; token: string }> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !(await Bun.password.verify(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return { user, token: await this.createSession(user, meta) };
  }

  async createSession(user: User, meta: SessionMeta): Promise<string> {
    const token = generateToken('ses');
    await this.db.insert(sessions).values({
      tokenHash: hashToken(token),
      userId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
    return token;
  }

  async logout(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
}
