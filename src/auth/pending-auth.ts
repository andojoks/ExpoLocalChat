import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'qb_pending_auth_v1';

export type PendingAuth =
  | { screen: 'verify-email'; email: string }
  | { screen: 'verify-password-reset'; identifier: string }
  | { screen: 'reset-password'; identifier: string; code: string };

const memory = new Map<string, string>();

async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    memory.set(key, value);
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (memory.has(key)) return memory.get(key) || null;
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string) {
  if (Platform.OS === 'web') {
    memory.delete(key);
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

function parsePending(raw: string | null): PendingAuth | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as PendingAuth;
    if (!data || typeof data !== 'object' || !('screen' in data)) return null;
    if (data.screen === 'verify-email' && typeof data.email === 'string' && data.email.trim()) {
      return { screen: 'verify-email', email: data.email.trim() };
    }
    if (
      data.screen === 'verify-password-reset' &&
      typeof data.identifier === 'string' &&
      data.identifier.trim()
    ) {
      return { screen: 'verify-password-reset', identifier: data.identifier.trim() };
    }
    if (
      data.screen === 'reset-password' &&
      typeof data.identifier === 'string' &&
      data.identifier.trim() &&
      typeof data.code === 'string' &&
      data.code.trim()
    ) {
      return {
        screen: 'reset-password',
        identifier: data.identifier.trim(),
        code: data.code.trim(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getPendingAuth(): Promise<PendingAuth | null> {
  return parsePending(await getItem(KEY));
}

export async function setPendingAuth(pending: PendingAuth): Promise<void> {
  await setItem(KEY, JSON.stringify(pending));
}

export async function clearPendingAuth(): Promise<void> {
  await deleteItem(KEY);
}

export function pendingAuthHref(pending: PendingAuth): {
  pathname:
    | '/(auth)/verify-email'
    | '/(auth)/verify-password-reset'
    | '/(auth)/reset-password';
  params: Record<string, string>;
} {
  if (pending.screen === 'verify-email') {
    return {
      pathname: '/(auth)/verify-email',
      params: { email: pending.email },
    };
  }
  if (pending.screen === 'verify-password-reset') {
    return {
      pathname: '/(auth)/verify-password-reset',
      params: { identifier: pending.identifier },
    };
  }
  return {
    pathname: '/(auth)/reset-password',
    params: { identifier: pending.identifier, code: pending.code },
  };
}
