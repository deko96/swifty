/**
 * Stable error codes returned by the panel API.
 *
 * Every error response has the shape `{ code, message, details?, requestId }`.
 * `code` is the machine-readable contract: UIs translate it, integrations
 * branch on it. `message` is an English fallback and may change wording at
 * any time; codes never change meaning within a major version.
 */
export const ERROR_CODES = [
  'auth.unauthenticated',
  'auth.invalid_credentials',
  'auth.session_expired',
  'auth.invalid_api_key',
  'auth.forbidden',
  'users.not_found',
  'users.email_taken',
  'users.username_taken',
  'users.self_delete',
  'users.last_admin',
  'setup.already_completed',
  'setup.invalid_code',
  'setup.no_active_code',
  'validation.failed',
  'common.bad_request',
  'common.not_found',
  'common.conflict',
  'common.rate_limited',
  'common.internal',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** One invalid field inside a `validation.failed` error. */
export interface ValidationDetail {
  /** Dot-separated path into the request body, e.g. `admin.email`. */
  path: string;
  /** English description of what is wrong with this field. */
  message: string;
  /** Failed validation rule, e.g. `invalid_type` or `too_small`; translatable. */
  rule: string;
}

/** Wire shape of every error response from the panel API. */
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: ValidationDetail[];
  requestId?: string;
}
