import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const client = new SQL(url);
await migrate(drizzle({ client }), { migrationsFolder: `${import.meta.dir}/../../drizzle` });
await client.close();
console.log('Migrations applied.');
