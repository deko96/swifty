import { Inject, Injectable } from '@nestjs/common';
import { UserRole } from '@swifty/sdk';
import { eq } from 'drizzle-orm';
import { AppException } from '../../common/app.exception';
import { DATABASE, type Database } from '../../db/database.module';
import { type User, users } from '../../db/schema';
import { EventBusService } from '../events/event-bus.service';
import type { CreateUserBody } from './users.schemas';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventBusService,
  ) {}

  async list(): Promise<User[]> {
    return this.db.select().from(users).orderBy(users.createdAt);
  }

  async findById(id: string): Promise<User> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) {
      throw new AppException(404, 'users.not_found', 'User not found');
    }
    return user;
  }

  async create(body: CreateUserBody): Promise<User> {
    const [byEmail] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);
    if (byEmail) {
      throw new AppException(409, 'users.email_taken', 'A user with this email already exists');
    }
    const [byUsername] = await this.db
      .select()
      .from(users)
      .where(eq(users.username, body.username))
      .limit(1);
    if (byUsername) {
      throw new AppException(
        409,
        'users.username_taken',
        'A user with this username already exists',
      );
    }

    const [user] = await this.db
      .insert(users)
      .values({
        email: body.email,
        username: body.username,
        passwordHash: await Bun.password.hash(body.password, 'argon2id'),
        role: body.role,
      })
      .returning();
    if (!user) {
      throw new Error('Insert returned no row');
    }
    this.events.emit('user.created', { userId: user.id });
    return user;
  }

  async delete(id: string): Promise<void> {
    const user = await this.findById(id);
    if (user.role === UserRole.Admin) {
      const admins = await this.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, UserRole.Admin))
        .limit(2);
      if (admins.length < 2) {
        throw new AppException(400, 'users.last_admin', 'Cannot delete the last admin account');
      }
    }
    await this.db.delete(users).where(eq(users.id, id));
  }
}
