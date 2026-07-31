import { randomBytes } from 'node:crypto';
import { SQL } from 'bun';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const client = new SQL(url);
const db = drizzle({ client, schema });

const existing = await db
  .select({ id: schema.users.id })
  .from(schema.users)
  .where(eq(schema.users.role, 'admin'))
  .limit(1);

if (existing.length > 0) {
  console.log('An admin user already exists; nothing to seed.');
} else {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@swifty.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(12).toString('base64url');

  await db.insert(schema.users).values({
    email,
    username: 'admin',
    passwordHash: await Bun.password.hash(password, 'argon2id'),
    role: 'admin',
  });

  console.log(`Admin user created: ${email}`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`Generated password (store it now, it will not be shown again): ${password}`);
  }
}

await client.close();
