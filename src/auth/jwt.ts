function base64UrlToUtf8(segment: string): string {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const atobFn = globalThis.atob;
  if (typeof atobFn !== 'function') {
    throw new Error('atob unavailable');
  }
  const binary = atobFn(padded);
  try {
    return decodeURIComponent(
      Array.from(binary, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    );
  } catch {
    return binary;
  }
}

/** Decode JWT payload without verifying signature (client UX / routing only). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    return JSON.parse(base64UrlToUtf8(parts[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Everlasting mobile access tokens omit `exp` and set `tokenKind=mobile`. */
export function isEverlastingMobileAccessToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  if (payload.tokenKind === 'mobile') return true;
  if (payload.tokenType === 'access' && payload.exp == null && typeof payload.deviceId === 'string') {
    return true;
  }
  return false;
}
