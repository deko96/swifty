import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type DatabaseConnection,
  PANEL_CONFIG_FILE_MODE,
  panelConfigPath,
  panelDatabaseUrl,
  readPanelConfig,
  writePanelConfig,
} from '../panel-config';

const connection: DatabaseConnection = {
  host: 'db.local',
  port: 5432,
  database: 'swifty',
  username: 'swifty',
  password: 'secret',
  ssl: false,
};

describe('panel config file', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'swifty-panel-config-'));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('returns an empty config when no file exists', async () => {
    expect(await readPanelConfig(dir)).toEqual({});
  });

  it('round-trips the database connection', async () => {
    await writePanelConfig({ database: connection }, dir);
    expect(await readPanelConfig(dir)).toEqual({ database: connection });
  });

  it('writes the file readable only by its owner, including on overwrite', async () => {
    await writePanelConfig({ database: connection }, dir);
    const created = (await stat(panelConfigPath(dir))).mode & 0o777;
    expect(created).toBe(PANEL_CONFIG_FILE_MODE);

    await writeFile(panelConfigPath(dir), 'database:\n', { mode: 0o644 });
    await writePanelConfig({ database: connection }, dir);
    const overwritten = (await stat(panelConfigPath(dir))).mode & 0o777;
    expect(overwritten).toBe(PANEL_CONFIG_FILE_MODE);
  });

  it('rejects a file that does not match the config shape', async () => {
    await writeFile(panelConfigPath(dir), 'database:\n  host: ""\n');
    expect(readPanelConfig(dir)).rejects.toThrow();
  });
});

describe('panelDatabaseUrl', () => {
  it('builds a postgres URL from the connection fields', () => {
    expect(panelDatabaseUrl(connection)).toBe('postgres://swifty:secret@db.local:5432/swifty');
  });

  it('percent-encodes credentials and the database name', () => {
    expect(
      panelDatabaseUrl({
        ...connection,
        username: 'u@ser',
        password: 'p@ss:word/x',
        database: 'my db',
      }),
    ).toBe('postgres://u%40ser:p%40ss%3Aword%2Fx@db.local:5432/my%20db');
  });

  it('requires TLS via sslmode when ssl is enabled', () => {
    expect(panelDatabaseUrl({ ...connection, ssl: true })).toBe(
      'postgres://swifty:secret@db.local:5432/swifty?sslmode=require',
    );
  });
});
