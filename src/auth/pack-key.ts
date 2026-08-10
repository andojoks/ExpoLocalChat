import { apiJson } from '@/api/http';
import {
  clearPackContentKey,
  ensureDeviceKeyPair,
  getPackContentKeyBase64,
  setPackContentKeyBase64,
  unwrapPackContentKey,
} from '@/auth/device-keys';

/** Fetch RSA-wrapped pack AES key and store in SecureStore. */
export async function syncPackContentKey(opts?: { force?: boolean }): Promise<string> {
  await ensureDeviceKeyPair();
  if (!opts?.force) {
    const existing = await getPackContentKeyBase64();
    if (existing) return existing;
  }

  const res = await apiJson<{ alg: string; key: string }>('/api/mobile/crypto/pack-key');
  if (!res?.key) throw new Error('Pack key response missing key');
  const plainB64 = await unwrapPackContentKey(res.key);
  await setPackContentKeyBase64(plainB64);
  return plainB64;
}

export async function ensurePackContentKey(): Promise<string> {
  const existing = await getPackContentKeyBase64();
  if (existing) return existing;
  return syncPackContentKey();
}

export async function dropPackContentKey() {
  await clearPackContentKey();
}
