import { getApiBaseUrl } from '@/config/api';
import { refresh as refreshTokens } from '@/auth/api';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from '@/auth/token-store';

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      await clearTokens();
      return null;
    }
    try {
      const pair = await refreshTokens(refreshToken);
      await setTokens(pair.accessToken, pair.refreshToken);
      return pair.accessToken;
    } catch {
      await clearTokens();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export type HttpOptions = RequestInit & {
  skipAuth?: boolean;
  /** Absolute URL bypasses api base join */
  absolute?: boolean;
};

export async function apiFetch(path: string, options: HttpOptions = {}): Promise<Response> {
  const { skipAuth, absolute, headers: initHeaders, ...rest } = options;
  const url = absolute ? path : `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;

  const headers = new Headers(initHeaders || {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  if (!skipAuth) {
    const token = await getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  let res = await fetch(url, { ...rest, headers });

  if (res.status === 401 && !skipAuth) {
    const next = await refreshAccessToken();
    if (next) {
      headers.set('Authorization', `Bearer ${next}`);
      res = await fetch(url, { ...rest, headers });
    }
  }

  return res;
}

export async function apiJson<T>(path: string, options: HttpOptions = {}): Promise<T> {
  const res = await apiFetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}
