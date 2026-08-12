import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  aesGcmDecryptPack,
  generateDeviceRsaKeyPair,
  rsaOaepSha256Decrypt,
} from '@/auth/device-crypto';

const PRIV_KEY = 'qb_device_priv_b64';
const PUB_KEY = 'qb_device_pub_b64';
const PACK_KEY = 'qb_pack_content_key';

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

function pemBody(pem: string): string {
  return pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
}

function wrapPem(bodyB64: string, type: 'PUBLIC KEY' | 'RSA PRIVATE KEY'): string {
  const lines = bodyB64.match(/.{1,64}/g) || [bodyB64];
  return `-----BEGIN ${type}-----\n${lines.join('\n')}\n-----END ${type}-----`;
}

let ensurePromise: Promise<{ publicKeyPem: string; privateKeyPem: string }> | null = null;

/** Generate or load device RSA-2048 keypair (PEM bodies in SecureStore). */
export async function ensureDeviceKeyPair(): Promise<{
  publicKeyPem: string;
  privateKeyPem: string;
}> {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    const existingPub = await getItem(PUB_KEY);
    const existingPriv = await getItem(PRIV_KEY);
    if (existingPub && existingPriv) {
      return {
        publicKeyPem: wrapPem(existingPub, 'PUBLIC KEY'),
        privateKeyPem: wrapPem(existingPriv, 'RSA PRIVATE KEY'),
      };
    }

    const pair = await generateDeviceRsaKeyPair();
    await Promise.all([
      setItem(PUB_KEY, pemBody(pair.publicKeyPem)),
      setItem(PRIV_KEY, pemBody(pair.privateKeyPem)),
    ]);
    return pair;
  })();

  try {
    return await ensurePromise;
  } finally {
    ensurePromise = null;
  }
}

export async function getDevicePublicKeyPem(): Promise<string> {
  const { publicKeyPem } = await ensureDeviceKeyPair();
  return publicKeyPem;
}

export async function getPackContentKeyBase64(): Promise<string | null> {
  return getItem(PACK_KEY);
}

export async function setPackContentKeyBase64(keyB64: string) {
  await setItem(PACK_KEY, keyB64);
}

export async function clearPackContentKey() {
  await deleteItem(PACK_KEY);
}

export async function clearDeviceCrypto() {
  await Promise.all([deleteItem(PRIV_KEY), deleteItem(PUB_KEY), deleteItem(PACK_KEY)]);
}

/** Unwrap RSA-OAEP-SHA256 ciphertext (base64) → AES key bytes as base64. */
export async function unwrapPackContentKey(wrappedBase64: string): Promise<string> {
  const { privateKeyPem } = await ensureDeviceKeyPair();
  return rsaOaepSha256Decrypt(privateKeyPem, wrappedBase64);
}

/**
 * Decrypt ELP1 | iv(12) | ciphertext|tag → UTF-8 pack JSON string.
 * Plaintext packs (legacy) are returned as-is when no magic header.
 */
export function decryptPackBlob(bytes: Uint8Array, packKeyBase64: string): string {
  return aesGcmDecryptPack(bytes, packKeyBase64);
}
