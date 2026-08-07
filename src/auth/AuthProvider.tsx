import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as authApi from '@/auth/api';
import type { AuthUser } from '@/auth/api';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from '@/auth/token-store';

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

async function applySession(tokens: { accessToken: string; refreshToken: string; user: AuthUser }) {
  await setTokens(tokens.accessToken, tokens.refreshToken);
  return tokens.user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  const refreshSession = useCallback(async () => {
    const access = await getAccessToken();
    const refresh = await getRefreshToken();
    if (!access && !refresh) {
      setUser(null);
      setStatus('unauthenticated');
      return;
    }
    try {
      if (access) {
        const me = await authApi.fetchMe(access);
        setUser(me);
        setStatus('authenticated');
        return;
      }
    } catch {
      /* try refresh */
    }
    if (refresh) {
      try {
        const pair = await authApi.refresh(refresh);
        const nextUser = await applySession(pair);
        setUser(nextUser);
        setStatus('authenticated');
        return;
      } catch {
        await clearTokens();
      }
    }
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const signInWithPassword = useCallback(async (identifier: string, password: string) => {
    const pair = await authApi.login(identifier, password);
    const next = await applySession(pair);
    setUser(next);
    setStatus('authenticated');
  }, []);

  const signUp = useCallback(
    async (input: { name?: string; email: string; password: string; phone?: string }) => {
      const result = await authApi.signup(input);
      setStatus('unauthenticated');
      setUser(null);
      return { email: result.user.email };
    },
    [],
  );

  const verifyEmail = useCallback(async (email: string, code: string) => {
    const pair = await authApi.verifyEmail(email, code);
    const next = await applySession(pair);
    setUser(next);
    setStatus('authenticated');
  }, []);

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
      const pair = await authApi.resetPassword(identifier, code, newPassword);
      const next = await applySession(pair);
      setUser(next);
      setStatus('authenticated');
    },
    [],
  );

  const signInWithGoogle = useCallback(async (idToken: string) => {
    const pair = await authApi.googleSignIn(idToken);
    const next = await applySession(pair);
    setUser(next);
    setStatus('authenticated');
  }, []);

  const updateProfile = useCallback(async (patch: { name?: string | null; phone?: string | null }) => {
    const access = await getAccessToken();
    if (!access) throw new Error('Not signed in');
    const next = await authApi.updateMe(access, patch);
    setUser(next);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* ignore */
    }
    await clearTokens();
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
