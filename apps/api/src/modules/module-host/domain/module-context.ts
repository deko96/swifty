import type { Logger } from '@nestjs/common';
import type { ModuleContext, ModuleManifest } from '@swifty/sdk';
import { EventBusService } from '../../events/event-bus.service';
import { SettingsService } from '../../settings/settings.service';

export const MODULE_SETTINGS_PREFIX = 'module';

export function moduleSettingsKey(moduleId: string, key: string): string {
  return `${MODULE_SETTINGS_PREFIX}.${moduleId}.${key}`;
}

/**
 * The capabilities handed to a module at registration. This surface — not
 * panel internals — is the stability contract from @swifty/sdk.
 */
export function buildModuleContext(
  manifest: ModuleManifest,
  logger: Logger,
  events: EventBusService,
  settings: SettingsService,
): ModuleContext {
  const prefix = `[${manifest.id}]`;
  const describe = (meta?: Record<string, unknown>) => (meta ? ` ${JSON.stringify(meta)}` : '');
  return {
    logger: {
      debug: (message, meta) => logger.debug(`${prefix} ${message}${describe(meta)}`),
      info: (message, meta) => logger.log(`${prefix} ${message}${describe(meta)}`),
      warn: (message, meta) => logger.warn(`${prefix} ${message}${describe(meta)}`),
      error: (message, meta) => logger.error(`${prefix} ${message}${describe(meta)}`),
    },
    on: (event, handler) => events.on(event, handler),
    settings: {
      get: (key) => settings.get(moduleSettingsKey(manifest.id, key)),
      set: (key, value) => settings.set(moduleSettingsKey(manifest.id, key), value),
    },
  };
}
