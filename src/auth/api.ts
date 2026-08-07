import { getApiBaseUrl } from '@/config/api';

export type AuthUser = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  image: string | null;
  emailVerified: string | null;
  role: string;
  createdAt: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

type ErrorBody = { error?: string; code?: string; email?: string };

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

async function postAuth<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await parseJson(res)) as T & ErrorBody;
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`) as Error & {
      status?: number;
      code?: string;
      email?: string;
    };
    err.status = res.status;
    err.code = data.code;
    err.email = data.email;
    throw err;
  }
  return data;
}

export function signup(input: {
  name?: string;
  email: string;
  password: string;
  phone?: string;
}) {
  return postAuth<{ ok: boolean; requiresEmailVerification: boolean; user: AuthUser }>(
    '/api/mobile/auth/signup',
    input,
  );
}

export function login(identifier: string, password: string) {
  return postAuth<AuthTokens>('/api/mobile/auth/login', { identifier, password });
}

export function refresh(refreshToken: string) {
  return postAuth<AuthTokens>('/api/mobile/auth/refresh', { refreshToken });
}

export function logout() {
  return postAuth<{ ok: boolean }>('/api/mobile/auth/logout', {});
}

export function verifyEmail(email: string, code: string) {
  return postAuth<AuthTokens>('/api/mobile/auth/verify-email', { email, code });
}

export function resendOtp(email: string, purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET') {
  return postAuth<{ ok: boolean }>('/api/mobile/auth/resend-otp', { email, purpose });
}

export function forgotPassword(identifier: string) {
  return postAuth<{ ok: boolean }>('/api/mobile/auth/forgot-password', { identifier });
}

export function resetPassword(identifier: string, code: string, newPassword: string) {
  return postAuth<AuthTokens>('/api/mobile/auth/reset-password', {
    identifier,
    code,
    newPassword,
  });
}

export function googleSignIn(idToken: string) {
  return postAuth<AuthTokens>('/api/mobile/auth/google', { idToken });
}

export async function fetchMe(accessToken: string) {
  const res = await fetch(`${getApiBaseUrl()}/api/mobile/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const data = (await parseJson(res)) as { user?: AuthUser } & ErrorBody;
  if (!res.ok) throw new Error(data.error || 'Failed to load profile');
  return data.user!;
}

export async function updateMe(
  accessToken: string,
  patch: { name?: string | null; phone?: string | null },
) {
  const res = await fetch(`${getApiBaseUrl()}/api/mobile/auth/me`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(patch),
  });
  const data = (await parseJson(res)) as { user?: AuthUser } & ErrorBody;
  if (!res.ok) throw new Error(data.error || 'Update failed');
  return data.user!;
}
