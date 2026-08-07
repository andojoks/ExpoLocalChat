import * as Crypto from 'expo-crypto';

/** SHA-256 hex digest for pack body (expo-crypto on native; Web Crypto on web). */
export async function sha256Hex(content: string): Promise<string> {
  try {
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, content);
  } catch {
    // Fallback for environments where the native module isn't linked (e.g. some Jest runs).
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
      throw new Error('SHA-256 is unavailable for checksum verification');
    }
    const data = new TextEncoder().encode(content);
    const digest = await subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
