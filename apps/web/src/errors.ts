import type { ErrorCode } from '@swifty/sdk';
import type { ApiError } from './api';

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  'auth.invalid_credentials': 'Wrong email or password.',
  'auth.session_expired': 'Your session has expired — please sign in again.',
  'setup.invalid_code': 'That setup code is not correct. Copy it from the panel console.',
  'setup.no_active_code': 'No setup code is active. Restart the panel to generate a new one.',
  'setup.already_completed': 'This panel has already been set up.',
  'common.rate_limited': 'Too many attempts — wait a minute and try again.',
  'common.internal': 'Something went wrong on the server. Try again in a moment.',
};

export function messageFor(error: ApiError): string {
  return MESSAGES[error.code] ?? error.message;
}
