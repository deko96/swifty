/**
 * Validates every template in `games/` against the schema.
 * Run via `bun run test`; exits non-zero on the first invalid template.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { GameTemplateSchema } from './schema';

const gamesDir = join(import.meta.dir, '..', 'games');
const files = (await readdir(gamesDir)).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

if (files.length === 0) {
  console.error(`No templates found in ${gamesDir}`);
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const raw = await Bun.file(join(gamesDir, file)).text();
  const result = GameTemplateSchema.safeParse(parse(raw));
  if (result.success) {
    console.log(`ok      ${file} (${result.data.id})`);
  } else {
    failed = true;
    console.error(`invalid ${file}`);
    for (const issue of result.error.issues) {
      console.error(`        ${issue.path.join('.')}: ${issue.message}`);
    }
  }
}

process.exit(failed ? 1 : 0);
