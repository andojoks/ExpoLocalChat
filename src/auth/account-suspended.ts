import { Alert } from 'react-native';
import { clearTokens } from '@/auth/token-store';

export const ACCOUNT_SUSPENDED_CODE = 'ACCOUNT_SUSPENDED';

export const ACCOUNT_SUSPENDED_MESSAGE =
  'Your account has been suspended. Please contact support at support@expertlearner.com for help.';

type ForcedLogoutHandler = () => void | Promise<void>;

let forcedLogoutHandler: ForcedLogoutHandler | null = null;
let lastSuspendedAlertAt = 0;

/** AuthProvider registers so API-layer logout also clears React auth state. */
export function setForcedLogoutHandler(handler: ForcedLogoutHandler | null) {
  forcedLogoutHandler = handler;
}

export function isAccountSuspendedError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === ACCOUNT_SUSPENDED_CODE;
}

export function accountSuspendedMessage(err?: { message?: string; error?: string } | null): string {
  const raw = (err?.message || err?.error || '').trim();
  if (raw && /support|suspend/i.test(raw)) return raw;
  return ACCOUNT_SUSPENDED_MESSAGE;
}

/**
 * Show suspension dialog, clear tokens, and force local logout.
 * Safe to call from http layer or AuthProvider (deduped alerts).
 */
export async function forceAccountSuspendedLogout(serverMessage?: string) {
  const message = accountSuspendedMessage({ message: serverMessage });
  const now = Date.now();
  if (now - lastSuspendedAlertAt >= 4000) {
    lastSuspendedAlertAt = now;
    Alert.alert('Account suspended', message);
  }
  await clearTokens();
  await forcedLogoutHandler?.();
}
