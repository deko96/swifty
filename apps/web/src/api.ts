export interface ApiFieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: ApiFieldError[] = [],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message =
      typeof body?.message === 'string' ? body.message : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, Array.isArray(body?.errors) ? body.errors : []);
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
