import {
  Buffer,
  constants,
  createDecipheriv,
  generateKeyPair,
  install,
  privateDecrypt,
} from 'react-native-quick-crypto';
import type { DeviceKeyPairPem } from './device-crypto';

let installed = false;

function ensureInstalled() {
  if (installed) return;
  install();
  installed = true;
}

/**
 * Native OpenSSL RSA-2048 via react-native-quick-crypto (background generateKeyPair).
 * Replaces slow node-forge JS keygen on iOS/Android.
 */
export async function generateDeviceRsaKeyPair(): Promise<DeviceKeyPairPem> {
  ensureInstalled();
  return new Promise((resolve, reject) => {
    generateKeyPair(
      'rsa',
      {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        // PKCS#1 matches existing SecureStore keys produced by forge.
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      },
      (err, publicKey, privateKey) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          publicKeyPem: String(publicKey),
          privateKeyPem: String(privateKey),
        });
      },
    );
  });
}

export async function rsaOaepSha256Decrypt(
  privateKeyPem: string,
  wrappedBase64: string,
): Promise<string> {
  ensureInstalled();
  const decrypted = privateDecrypt(
    {
      key: privateKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(wrappedBase64, 'base64'),
  );
  return Buffer.from(decrypted).toString('base64');
}

const ELP1 = 'ELP1';

export function aesGcmDecryptPack(bytes: Uint8Array, packKeyBase64: string): string {
  ensureInstalled();
  const magic = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (magic !== ELP1) {
    return new TextDecoder().decode(bytes);
  }
  if (bytes.length < 4 + 12 + 16) {
    throw new Error('Invalid encrypted pack');
  }
  const iv = bytes.subarray(4, 16);
  const tag = bytes.subarray(bytes.length - 16);
  const data = bytes.subarray(16, bytes.length - 16);
  const key = Buffer.from(packKeyBase64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv));
  decipher.setAuthTag(Buffer.from(tag));
  const out = Buffer.concat([decipher.update(Buffer.from(data)), decipher.final()]);
  return out.toString('utf8');
}
