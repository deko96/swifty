import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../../db/database.module';
import { type User, users } from '../../db/schema';
import type { CreateUserBody } from './users.schemas';

@Injectable()
export class UsersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<User[]> {
    return this.db.select().from(users).orderBy(users.createdAt);
  }

  async findById(id: string): Promise<User> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) {
      throw new NotFoundException('User not found');
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
      throw new ConflictException('A user with this email already exists');
    }
    const [byUsername] = await this.db
      .select()
      .from(users)
      .where(eq(users.username, body.username))
      .limit(1);
    if (byUsername) {
      throw new ConflictException('A user with this username already exists');
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
    return user;
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
    if (deleted.length === 0) {
      throw new NotFoundException('User not found');
    }
  }
}
