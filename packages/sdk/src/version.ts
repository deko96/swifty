/**
 * Version of the panel module API, following semver.
 *
 * Modules declare a compatible range in their manifest (`panelApi`); the
 * panel refuses to load a module whose range does not satisfy this version.
 * Bumped independently of the panel's own release version.
 */
export const PANEL_API_VERSION = '0.1.0';
