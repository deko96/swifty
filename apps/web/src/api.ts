import type { ApiErrorBody, ErrorCode, ValidationDetail } from '@swifty/sdk';

export class ApiError extends Error {
  constructor(
    readonly body: ApiErrorBody,
    readonly status: number,
  ) {
    super(body.message);
  }

  get code(): ErrorCode {
    return this.body.code;
  }

  get details(): ValidationDetail[] {
    return this.body.details ?? [];
  }
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as ApiErrorBody).code === 'string' &&
    typeof (body as ApiErrorBody).message === 'string'
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new ApiError(
      isApiErrorBody(body)
        ? body
        : { code: 'common.internal', message: `Request failed (${response.status})` },
      response.status,
    );
  }
  return body as T;
}

export interface SetupStatus {
  required: boolean;
}

export interface UserResponse {
  id: string;
  email: string;
  username: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface HealthResponse {
  status: string;
  uptimeSeconds: number;
  panelApiVersion: string;
}

export function getSetupStatus(): Promise<SetupStatus> {
  return request('/api/v1/setup');
}

export function completeSetup(body: {
  setupCode: string;
  panelName: string;
  admin: { email: string; username: string; password: string };
}): Promise<UserResponse> {
  return request('/api/v1/setup', { method: 'POST', body: JSON.stringify(body) });
}

export function getHealth(): Promise<HealthResponse> {
  return request('/api/v1/health');
}
