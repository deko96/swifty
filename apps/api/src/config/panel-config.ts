import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { z } from 'zod';

export const PANEL_CONFIG_FILE = 'config.yml';
export const PANEL_CONFIG_FILE_MODE = 0o600;
export const DEFAULT_CONFIG_DIR = join(import.meta.dir, '..', '..', 'config');

export const databaseConnectionSchema = z.object({
  host: z.string().min(1).describe('Hostname or IP address of the PostgreSQL server'),
  port: z.number().int().min(1).max(65535).describe('PostgreSQL port, usually 5432'),
  database: z.string().min(1).describe('Name of the database the panel will use'),
  username: z.string().min(1).describe('Database user the panel connects as'),
  password: z.string().describe('Password for the database user'),
  ssl: z.boolean().default(false).describe('Require TLS for the database connection'),
});

export type DatabaseConnection = z.infer<typeof databaseConnectionSchema>;

export const panelConfigSchema = z.object({
  database: databaseConnectionSchema.optional(),
});

export type PanelConfig = z.infer<typeof panelConfigSchema>;

export function panelConfigPath(dir: string): string {
  return join(dir, PANEL_CONFIG_FILE);
}

export async function readPanelConfig(dir: string): Promise<PanelConfig> {
  const file = Bun.file(panelConfigPath(dir));
  if (!(await file.exists())) {
    return {};
  }
  return panelConfigSchema.parse(parse(await file.text()) ?? {});
}

export async function writePanelConfig(config: PanelConfig, dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = panelConfigPath(dir);
  await writeFile(path, stringify(config), { mode: PANEL_CONFIG_FILE_MODE });
  // writeFile only applies mode on create; chmod covers overwrites.
  await chmod(path, PANEL_CONFIG_FILE_MODE);
}

export function panelDatabaseUrl(connection: DatabaseConnection): string {
  const auth = `${encodeURIComponent(connection.username)}:${encodeURIComponent(connection.password)}`;
  const database = encodeURIComponent(connection.database);
  const options = connection.ssl ? '?sslmode=require' : '';
  return `postgres://${auth}@${connection.host}:${connection.port}/${database}${options}`;
}
