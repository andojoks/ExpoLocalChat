import { getApiBaseUrl } from '@/config/api';
import { Alert } from 'react-native';
import { refresh as refreshTokens } from '@/auth/api';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from '@/auth/token-store';
import { ensureDeviceKeyPair, getDevicePublicKeyPem } from '@/auth/device-keys';
import { collectDeviceAuthFields } from '@/auth/device-id';
import { isEverlastingMobileAccessToken } from '@/auth/jwt';
import {
  ACCOUNT_SUSPENDED_CODE,
  forceAccountSuspendedLogout,
} from '@/auth/account-suspended';

const DEVICE_SUPERSEDED_CODE = 'DEVICE_SUPERSEDED';
/** Explicit revoke codes — opaque 401s must not wipe everlasting sessions. */
const AUTH_REVOKE_CODES = new Set([
  DEVICE_SUPERSEDED_CODE,
  'AUTH_REVOKED',
  'NO_DEVICE_SESSION',
  'INVALID_TOKEN',
  'MISSING_DEVICE_ID',
]);

let refreshPromise: Promise<string | null> | null = null;
let lastSupersededAlertAt = 0;

function maybeAlertDeviceSuperseded(body: {
  code?: string;
  error?: string;
}) {
  if (body.code !== DEVICE_SUPERSEDED_CODE) return;
  const now = Date.now();
  if (now - lastSupersededAlertAt < 4000) return;
  lastSupersededAlertAt = now;
  Alert.alert(
    'Signed out',
    body.error ||
      'You have been signed out. App detected a new login on another device.',
  );
}

function shouldClearEverlastingOn401(code?: string): boolean {
  return Boolean(code && AUTH_REVOKE_CODES.has(code));
}

async function handleSuspendedIfNeeded(res: Response): Promise<boolean> {
  if (res.status !== 403 && res.status !== 401) return false;
  const body = (await res
    .clone()
    .json()
    .catch(() => ({}))) as { code?: string; error?: string };
  if (body.code !== ACCOUNT_SUSPENDED_CODE) return false;
  await forceAccountSuspendedLogout(body.error);
  return true;
}

async function refreshAccessToken(opts?: {
  revokeCode?: string;
}): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const currentAccess = await getAccessToken();
      // Device-bound everlasting tokens: only clear on explicit revoke codes.
      if (isEverlastingMobileAccessToken(currentAccess)) {
        if (shouldClearEverlastingOn401(opts?.revokeCode)) {
          await clearTokens();
        }
        return null;
      }

      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        await clearTokens();
        return null;
      }
      try {
        await ensureDeviceKeyPair().catch(() => undefined);
        let devicePublicKey: string | undefined;
        try {
          devicePublicKey = await getDevicePublicKeyPem();
        } catch {
          devicePublicKey = undefined;
        }
        const device = await collectDeviceAuthFields(devicePublicKey);
        const pair = await refreshTokens(refreshToken, device);
        await setTokens(pair.accessToken, pair.refreshToken);
        try {
          const { syncPackContentKey } = await import('@/auth/pack-key');
          await syncPackContentKey();
        } catch {
          /* pack key optional until install */
        }
        return pair.accessToken;
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === ACCOUNT_SUSPENDED_CODE) {
          await forceAccountSuspendedLogout((e as Error).message);
          return null;
        }
        if (shouldClearEverlastingOn401(code) || code === DEVICE_SUPERSEDED_CODE) {
          await clearTokens();
        } else if (!isEverlastingMobileAccessToken(currentAccess)) {
          await clearTokens();
        }
        return null;
      }
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

  if (!skipAuth && (await handleSuspendedIfNeeded(res))) {
    return res;
  }

  if (res.status === 401 && !skipAuth) {
    const body = (await res
      .clone()
      .json()
      .catch(() => ({}))) as { code?: string; error?: string };
    maybeAlertDeviceSuperseded(body);

    const next = await refreshAccessToken({ revokeCode: body.code });
    if (next) {
      headers.set('Authorization', `Bearer ${next}`);
      res = await fetch(url, { ...rest, headers });
      if (await handleSuspendedIfNeeded(res)) {
        return res;
      }
    }
  }

  return res;
}

export async function apiJson<T>(path: string, options: HttpOptions = {}): Promise<T> {
  const res = await apiFetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const body = data as { error?: string; code?: string; deviceType?: string; loggedInAt?: string };
    const err = new Error(body.error || `Request failed (${res.status})`) as Error & {
      status?: number;
      code?: string;
      deviceType?: string;
      loggedInAt?: string;
    };
    err.status = res.status;
    err.code = body.code;
    err.deviceType = body.deviceType;
    err.loggedInAt = body.loggedInAt;
    throw err;
  }
  return data as T;
}
