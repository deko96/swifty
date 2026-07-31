import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EnvService } from '../../config/env.service';
import { EventBusService } from '../events/event-bus.service';
import type { SettingsService } from '../settings/settings.service';
import { moduleSettingsKey } from './module-context';
import { ModuleLoaderService } from './module-loader.service';

class FakeSettings {
  readonly store = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }
  async set(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }
}

function loader(dir: string, events: EventBusService, settings: FakeSettings) {
  return new ModuleLoaderService(
    { modulesDir: dir } as EnvService,
    events,
    settings as unknown as SettingsService,
  );
}

async function writeModule(root: string, dirName: string, source: string): Promise<void> {
  const dir = join(root, dirName);
  await mkdir(dir);
  await writeFile(join(dir, 'index.ts'), source);
}

const workingModule = (id: string, panelApi = '^0.1.0') => `
export default {
  manifest: { id: '${id}', name: 'Fixture', version: '1.0.0', panelApi: '${panelApi}' },
  async register(context) {
    await context.settings.set('registered', true);
    context.on('server.created', (payload) => {
      globalThis.__fixtureEvents = globalThis.__fixtureEvents ?? [];
      globalThis.__fixtureEvents.push('${id}:' + payload.serverId);
    });
  },
  shutdown() {
    globalThis.__fixtureShutdowns = globalThis.__fixtureShutdowns ?? [];
    globalThis.__fixtureShutdowns.push('${id}');
  },
};
`;

describe('ModuleLoaderService', () => {
  let root: string;
  let events: EventBusService;
  let settings: FakeSettings;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'swifty-modules-'));
    events = new EventBusService();
    settings = new FakeSettings();
    (globalThis as Record<string, unknown>).__fixtureEvents = [];
    (globalThis as Record<string, unknown>).__fixtureShutdowns = [];
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it('loads a valid module, registers it, and wires context capabilities', async () => {
    await writeModule(root, 'fixture-a', workingModule('fixture-a'));
    const service = loader(root, events, settings);

    await service.onApplicationBootstrap();

    expect(service.manifests().map((manifest) => manifest.id)).toEqual(['fixture-a']);
    expect(settings.store.get(moduleSettingsKey('fixture-a', 'registered'))).toBe(true);

    events.emit('server.created', {
      serverId: 's1',
      ownerId: 'u1',
      nodeId: 'n1',
      templateId: 't1',
    });
    expect((globalThis as Record<string, unknown>).__fixtureEvents).toEqual(['fixture-a:s1']);
  });

  it('skips a module with an invalid manifest', async () => {
    await writeModule(
      root,
      'bad-manifest',
      `export default { manifest: { id: 'Bad_ID', name: '', version: 'x', panelApi: '???' }, register() {} };`,
    );
    const service = loader(root, events, settings);

    await service.onApplicationBootstrap();

    expect(service.manifests()).toEqual([]);
  });

  it('skips a module requiring an incompatible panel API', async () => {
    await writeModule(root, 'future', workingModule('future', '^99.0.0'));
    const service = loader(root, events, settings);

    await service.onApplicationBootstrap();

    expect(service.manifests()).toEqual([]);
  });

  it('skips a duplicate module id and keeps the first', async () => {
    await writeModule(root, 'a-first', workingModule('dupe'));
    await writeModule(root, 'b-second', workingModule('dupe'));
    const service = loader(root, events, settings);

    await service.onApplicationBootstrap();

    expect(service.manifests()).toHaveLength(1);
  });

  it('survives a module whose register throws and loads the rest', async () => {
    await writeModule(
      root,
      'a-broken',
      `export default {
        manifest: { id: 'broken', name: 'Broken', version: '1.0.0', panelApi: '^0.1.0' },
        register() { throw new Error('boot failure'); },
      };`,
    );
    await writeModule(root, 'b-working', workingModule('working'));
    const service = loader(root, events, settings);

    await service.onApplicationBootstrap();

    expect(service.manifests().map((manifest) => manifest.id)).toEqual(['working']);
  });

  it('calls shutdown on application shutdown', async () => {
    await writeModule(root, 'fixture-a', workingModule('fixture-a'));
    const service = loader(root, events, settings);
    await service.onApplicationBootstrap();

    await service.onApplicationShutdown();

    expect((globalThis as Record<string, unknown>).__fixtureShutdowns).toEqual(['fixture-a']);
    expect(service.manifests()).toEqual([]);
  });

  it('does nothing when no modules directory is configured', async () => {
    const service = loader('', events, settings);
    await service.onApplicationBootstrap();
    expect(service.manifests()).toEqual([]);
  });

  it('warns but does not throw for a missing directory', async () => {
    const service = loader(join(root, 'does-not-exist'), events, settings);
    await service.onApplicationBootstrap();
    expect(service.manifests()).toEqual([]);
  });
});
