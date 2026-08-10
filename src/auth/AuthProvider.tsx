import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import * as authApi from '@/auth/api';
import type { AuthUser } from '@/auth/api';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from '@/auth/token-store';
import { ensureDeviceKeyPair, getDevicePublicKeyPem } from '@/auth/device-keys';
import { dropPackContentKey, syncPackContentKey } from '@/auth/pack-key';
import { collectDeviceAuthFields, getStableDeviceId } from '@/auth/device-id';
import { decodeJwtPayload, isEverlastingMobileAccessToken } from '@/auth/jwt';
import { reconcileContentOwner } from '@/auth/content-owner';
import {
  accountSuspendedMessage,
  forceAccountSuspendedLogout,
  isAccountSuspendedError,
  setForcedLogoutHandler,
} from '@/auth/account-suspended';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  signInWithPassword: (identifier: string, password: string) => Promise<void>;
  signUp: (input: {
    name?: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<{ email: string }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendOtp: (email: string, purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET') => Promise<void>;
  forgotPassword: (identifier: string) => Promise<void>;
  resetPassword: (identifier: string, code: string, newPassword: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  updateProfile: (patch: { name?: string | null; phone?: string | null }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function userFromAccessToken(accessToken: string): AuthUser | null {
  const payload = decodeJwtPayload(accessToken);
  if (!payload?.sub || typeof payload.email !== 'string') return null;
  return {
    id: String(payload.sub),
    name: null,
    email: String(payload.email),
    phone: null,
    image: null,
    emailVerified: null,
    role: typeof payload.role === 'string' ? payload.role : 'USER',
    createdAt: '',
  };
}

async function withDeviceAuth() {
  await ensureDeviceKeyPair();
  let devicePublicKey: string | undefined;
  try {
    devicePublicKey = await getDevicePublicKeyPem();
  } catch {
    devicePublicKey = undefined;
  }
  return collectDeviceAuthFields(devicePublicKey);
}

function notifyDeviceSuperseded(err: unknown) {
  const e = err as { code?: string; message?: string };
  if (e?.code !== 'DEVICE_SUPERSEDED') return;
  Alert.alert(
    'Signed out',
    e.message ||
      'You have been signed out. App detected a new login on another device.',
  );
}

function rethrowAuthError(err: unknown): never {
  if (isAccountSuspendedError(err)) {
    const e = err as Error;
    e.message = accountSuspendedMessage(e);
    throw e;
  }
  throw err;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  const clearLocalSession = useCallback(async () => {
    try {
      const { cancelStudyReminders } = await import('@/notifications/study-reminders');
      await cancelStudyReminders();
    } catch {
      /* ignore */
    }
    await clearTokens();
    await dropPackContentKey();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  useEffect(() => {
    setForcedLogoutHandler(async () => {
      await dropPackContentKey();
      setUser(null);
      setStatus('unauthenticated');
    });
    return () => setForcedLogoutHandler(null);
  }, []);

  const applySession = useCallback(
    async (tokens: { accessToken: string; refreshToken: string; user: AuthUser }) => {
      await setTokens(tokens.accessToken, tokens.refreshToken);
      await reconcileContentOwner(db, tokens.user.id);
      try {
        await syncPackContentKey();
      } catch (e) {
        console.warn('[auth] pack key sync failed', e);
      }
      void import('@/notifications/study-reminders').then((m) =>
        m.syncStudyRemindersOnLaunch(),
      );
      return tokens.user;
    },
    [db],
  );

  const refreshSession = useCallback(async () => {
    // Always establish device id (+ keys) on launch, in parallel — same as before, without serial stalls.
    await Promise.all([
      ensureDeviceKeyPair().catch(() => undefined),
      getStableDeviceId().catch(() => undefined),
    ]);

    const access = await getAccessToken();
    const refresh = await getRefreshToken();
    if (!access && !refresh) {
      setUser(null);
      setStatus('unauthenticated');
      return;
    }

    if (access) {
      try {
        const me = await authApi.fetchMe(access);
        await reconcileContentOwner(db, me.id);
        setUser(me);
        setStatus('authenticated');
        try {
          await syncPackContentKey();
        } catch {
          /* optional until first pack install */
        }
        void import('@/notifications/study-reminders').then((m) =>
          m.syncStudyRemindersOnLaunch(),
        );
        return;
      } catch (e) {
        const statusCode = (e as { status?: number })?.status;
        const code = (e as { code?: string })?.code;
        if (isAccountSuspendedError(e)) {
          await forceAccountSuspendedLogout((e as Error).message);
          return;
        }
        // Revoked / mismatched / superseded device — never refresh-steal a session.
        if (statusCode === 401 && isEverlastingMobileAccessToken(access)) {
          if (code === 'DEVICE_SUPERSEDED') notifyDeviceSuperseded(e);
          await clearLocalSession();
          return;
        }
        // Offline / transient: keep authenticated path if everlasting token looks valid.
        if (statusCode !== 401 && statusCode !== 403 && isEverlastingMobileAccessToken(access)) {
          const stub = userFromAccessToken(access);
          if (stub) {
            await reconcileContentOwner(db, stub.id).catch(() => undefined);
            setUser(stub);
            setStatus('authenticated');
            return;
          }
        }
        // Short-lived access 401 falls through to refresh below.
      }
    }

    if (refresh) {
      try {
        const device = await withDeviceAuth();
        const pair = await authApi.refresh(refresh, device);
        const nextUser = await applySession(pair);
        setUser(nextUser);
        setStatus('authenticated');
        return;
      } catch (e) {
        if (isAccountSuspendedError(e)) {
          await forceAccountSuspendedLogout((e as Error).message);
          return;
        }
        notifyDeviceSuperseded(e);
        await clearTokens();
        await dropPackContentKey();
      }
    }

    setUser(null);
    setStatus('unauthenticated');
  }, [applySession, clearLocalSession, db]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const signInWithPassword = useCallback(
    async (identifier: string, password: string) => {
      try {
        const device = await withDeviceAuth();
        const pair = await authApi.login(identifier, password, device);
        const next = await applySession(pair);
        setUser(next);
        setStatus('authenticated');
      } catch (e) {
        rethrowAuthError(e);
      }
    },
    [applySession],
  );

  const signUp = useCallback(
    async (input: { name?: string; email: string; password: string; phone?: string }) => {
      const result = await authApi.signup(input);
      setStatus('unauthenticated');
      setUser(null);
      return { email: result.user.email };
    },
    [],
  );

  const verifyEmail = useCallback(
    async (email: string, code: string) => {
      try {
        const device = await withDeviceAuth();
        const pair = await authApi.verifyEmail(email, code, device);
        const next = await applySession(pair);
        setUser(next);
        setStatus('authenticated');
      } catch (e) {
        rethrowAuthError(e);
      }
    },
    [applySession],
  );

  const resendOtp = useCallback(
    async (email: string, purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET') => {
      await authApi.resendOtp(email, purpose);
    },
    [],
  );

  const forgotPassword = useCallback(async (identifier: string) => {
    await authApi.forgotPassword(identifier);
  }, []);

  const resetPassword = useCallback(
    async (identifier: string, code: string, newPassword: string) => {
      try {
        const device = await withDeviceAuth();
        const pair = await authApi.resetPassword(identifier, code, newPassword, device);
        const next = await applySession(pair);
        setUser(next);
        setStatus('authenticated');
      } catch (e) {
        rethrowAuthError(e);
      }
    },
    [applySession],
  );

  const signInWithGoogle = useCallback(
    async (idToken: string) => {
      try {
        const device = await withDeviceAuth();
        const pair = await authApi.googleSignIn(idToken, device);
        const next = await applySession(pair);
        setUser(next);
        setStatus('authenticated');
      } catch (e) {
        rethrowAuthError(e);
      }
    },
    [applySession],
  );

  const updateProfile = useCallback(async (patch: { name?: string | null; phone?: string | null }) => {
    const access = await getAccessToken();
    if (!access) throw new Error('Not signed in');
    try {
      const next = await authApi.updateMe(access, patch);
      setUser(next);
    } catch (e) {
      if (isAccountSuspendedError(e)) {
        await forceAccountSuspendedLogout((e as Error).message);
        return;
      }
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    // Local-only logout — device session table updates on next login.
    try {
      const { cancelStudyReminders } = await import('@/notifications/study-reminders');
      await cancelStudyReminders();
    } catch {
      /* ignore */
    }
    await clearTokens();
    await dropPackContentKey();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      signInWithPassword,
      signUp,
      verifyEmail,
      resendOtp,
      forgotPassword,
      resetPassword,
      signInWithGoogle,
      updateProfile,
      signOut,
      refreshSession,
    }),
    [
      status,
      user,
      signInWithPassword,
      signUp,
      verifyEmail,
      resendOtp,
      forgotPassword,
      resetPassword,
      signInWithGoogle,
      updateProfile,
      signOut,
      refreshSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
