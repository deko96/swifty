import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type ModuleManifest, PANEL_API_VERSION, type SwiftyModule } from '@swifty/sdk';
import { satisfies } from 'semver';
import { EnvService } from '../../config/env.service';
import { EventBusService } from '../events/event-bus.service';
import { SettingsService } from '../settings/settings.service';
import { manifestSchema } from './manifest.schema';
import { buildModuleContext } from './module-context';

const ENTRY_CANDIDATES = ['index.ts', 'index.js', 'index.mjs'];

/**
 * Discovers and boots panel modules from the directory named by MODULES_DIR.
 * Each immediate subdirectory is one module package whose default export
 * satisfies the SwiftyModule contract. A module that fails validation or
 * registration is skipped with a log line — a broken module must never take
 * the panel down.
 */
@Injectable()
export class ModuleLoaderService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('modules');
  private readonly loaded = new Map<string, SwiftyModule>();

  constructor(
    private readonly env: EnvService,
    private readonly events: EventBusService,
    private readonly settings: SettingsService,
  ) {}

  manifests(): ModuleManifest[] {
    return [...this.loaded.values()].map((module) => module.manifest);
  }

  async onApplicationBootstrap(): Promise<void> {
    const dir = this.env.modulesDir;
    if (!dir) {
      return;
    }
    await this.loadAll(dir);
  }

  async onApplicationShutdown(): Promise<void> {
    for (const [id, module] of [...this.loaded].reverse()) {
      try {
        await module.shutdown?.();
      } catch (error) {
        this.logger.error(`module ${id} failed during shutdown: ${describeError(error)}`);
      }
    }
    this.loaded.clear();
  }

  async loadAll(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => undefined);
    if (!entries) {
      this.logger.warn(`modules directory ${dir} is not readable; no modules loaded`);
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await this.loadOne(join(dir, entry.name));
      }
    }
    this.logger.log(`${this.loaded.size} module(s) active`);
  }

  private async loadOne(dir: string): Promise<void> {
    const entry = await resolveEntry(dir);
    if (!entry) {
      this.logger.warn(`skipping ${dir}: no package.json main or index entry found`);
      return;
    }
    try {
      const imported = (await import(pathToFileURL(entry).href)) as { default?: SwiftyModule };
      const module = imported.default;
      if (!module || typeof module.register !== 'function') {
        this.logger.warn(`skipping ${dir}: default export does not satisfy SwiftyModule`);
        return;
      }

      const parsed = manifestSchema.safeParse(module.manifest);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
        this.logger.warn(`skipping ${dir}: invalid manifest (${issues})`);
        return;
      }
      const manifest = parsed.data;

      if (!satisfies(PANEL_API_VERSION, manifest.panelApi)) {
        this.logger.warn(
          `skipping ${manifest.id}@${manifest.version}: requires panel API ${manifest.panelApi}, this panel provides ${PANEL_API_VERSION}`,
        );
        return;
      }
      if (this.loaded.has(manifest.id)) {
        this.logger.warn(`skipping ${dir}: module id '${manifest.id}' is already loaded`);
        return;
      }

      await module.register(buildModuleContext(manifest, this.logger, this.events, this.settings));
      this.loaded.set(manifest.id, module);
      this.logger.log(`loaded ${manifest.id}@${manifest.version}`);
    } catch (error) {
      this.logger.error(`failed to load module at ${dir}: ${describeError(error)}`);
    }
  }
}

async function resolveEntry(dir: string): Promise<string | undefined> {
  const packageJson = join(dir, 'package.json');
  try {
    const pkg = JSON.parse(await readFile(packageJson, 'utf8')) as { main?: string };
    if (pkg.main) {
      return join(dir, pkg.main);
    }
  } catch {
    // no package.json — fall through to index candidates
  }
  for (const candidate of ENTRY_CANDIDATES) {
    const path = join(dir, candidate);
    try {
      await stat(path);
      return path;
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
