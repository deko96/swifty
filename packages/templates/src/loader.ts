import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { type GameTemplate, GameTemplateSchema } from './schema';

const officialGamesDir = join(import.meta.dir, '..', 'games');

export async function loadTemplates(dir: string = officialGamesDir): Promise<GameTemplate[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  const templates = await Promise.all(
    files.map(async (file) => {
      const raw = await Bun.file(join(dir, file)).text();
      return GameTemplateSchema.parse(parse(raw));
    }),
  );
  return templates.sort((a, b) => a.id.localeCompare(b.id));
}
