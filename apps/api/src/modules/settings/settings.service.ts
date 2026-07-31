import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../../db/database.module';
import { settings } from '../../db/schema';

@Injectable()
export class SettingsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get<T>(key: string): Promise<T | undefined> {
    const [row] = await this.db.select().from(settings).where(eq(settings.key, key)).limit(1);
    return row?.value as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  }

  async delete(key: string): Promise<boolean> {
    const deleted = await this.db
      .delete(settings)
      .where(eq(settings.key, key))
      .returning({ key: settings.key });
    return deleted.length > 0;
  }
}
