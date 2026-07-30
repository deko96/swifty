import type { SwiftyEventMap, SwiftyEventName } from './events';

/**
 * Static metadata every module ships alongside its code.
 * Read by the panel before the module is loaded or executed.
 */
export interface ModuleManifest {
  /** Unique, stable identifier in kebab-case, e.g. `whmcs-billing`. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Module version (semver). */
  version: string;
  /** Semver range of `PANEL_API_VERSION` this module supports, e.g. `^0.1.0`. */
  panelApi: string;
  description?: string;
  author?: string;
  /** SPDX identifier, or `proprietary` for paid modules. */
  license?: string;
}

/** Minimal logging facade provided to modules; backed by the panel's logger. */
export interface ModuleLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Capabilities handed to a module during registration.
 *
 * This surface — not panel internals — is the stability contract: anything a
 * module needs must be reachable from here or via the public REST API.
 */
export interface ModuleContext {
  logger: ModuleLogger;
  /** Subscribe to a typed core event. Returns an unsubscribe function. */
  on<E extends SwiftyEventName>(
    event: E,
    handler: (payload: SwiftyEventMap[E]) => void | Promise<void>,
  ): () => void;
  /** Persisted key-value settings scoped to this module. */
  settings: {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
  };
}

/**
 * The contract a Swifty module implements.
 *
 * A module package's default export must satisfy this interface. `register`
 * is called once at panel boot after manifest and license validation.
 */
export interface SwiftyModule {
  manifest: ModuleManifest;
  register(context: ModuleContext): void | Promise<void>;
  /** Called on graceful panel shutdown; release resources here. */
  shutdown?(): void | Promise<void>;
}
