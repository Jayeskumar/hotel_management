/**
 * Fetch wrapper: attaches the in-memory access token, transparently refreshes
 * it once on 401 using the httpOnly refresh cookie, and normalises errors.
 */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshing: Promise<boolean> | null = null;

export const tokenStore = {
  get: () => accessToken,
  set: (t: string | null) => { accessToken = t; },
  onExpired: (fn: () => void) => { onSessionExpired = fn; },
};

let inflight: Promise<unknown | null> | null = null;

async function doRefresh(attempt = 0): Promise<unknown | null> {
  const res = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
  if (res.ok) {
    const body = await res.json();
    accessToken = body.accessToken;
    return body;
  }
  // Another tab may have just rotated the cookie; the browser now holds the new one.
  if (res.status === 401 && attempt === 0) {
    await new Promise((r) => setTimeout(r, 400));
    return doRefresh(1);
  }
  return null;
}

/** Single-flight: concurrent callers share one refresh request. */
export function refreshSession(): Promise<unknown | null> {
  inflight ??= doRefresh().finally(() => { inflight = null; });
  return inflight;
}

async function tryRefresh(): Promise<boolean> {
  refreshing ??= refreshSession().then((b) => !!b).finally(() => { refreshing = null; });
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await tryRefresh()) return request<T>(method, path, body, false);
    onSessionExpired?.();
  }
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'ERROR', err.message ?? res.statusText, err.details);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b: unknown = {}) => request<T>('POST', p, b),
  put: <T>(p: string, b: unknown) => request<T>('PUT', p, b),
  patch: <T>(p: string, b: unknown) => request<T>('PATCH', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
};

/** Download a file from an authenticated endpoint. */
export async function download(path: string, filename: string) {
  let res = await fetch(`/api/v1${path}`, { headers: { authorization: `Bearer ${accessToken}` }, credentials: 'include' });
  if (res.status === 401 && (await tryRefresh())) {
    res = await fetch(`/api/v1${path}`, { headers: { authorization: `Bearer ${accessToken}` }, credentials: 'include' });
  }
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'Download failed');
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'VALIDATION_ERROR' && Array.isArray(e.details) && e.details.length) {
      const d = e.details[0] as { path: string; message: string };
      return d.path ? `${d.path}: ${d.message}` : d.message;
    }
    return e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}
