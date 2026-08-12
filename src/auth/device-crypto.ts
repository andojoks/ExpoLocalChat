import forge from 'node-forge';

export type DeviceKeyPairPem = {
  publicKeyPem: string;
  privateKeyPem: string;
};

/**
 * Default / web implementation (node-forge).
 * Native builds resolve `device-crypto.native.ts` instead (react-native-quick-crypto).
 */
export async function generateDeviceRsaKeyPair(): Promise<DeviceKeyPairPem> {
  const pair = forge.pki.rsa.generateKeyPair({ bits: 2048, workers: 0 });
  return {
    publicKeyPem: forge.pki.publicKeyToPem(pair.publicKey),
    privateKeyPem: forge.pki.privateKeyToPem(pair.privateKey),
  };
}

export async function rsaOaepSha256Decrypt(
  privateKeyPem: string,
  wrappedBase64: string,
): Promise<string> {
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const bytes = forge.util.decode64(wrappedBase64);
  const decrypted = privateKey.decrypt(bytes, 'RSA-OAEP', {
    md: forge.md.sha256.create(),
    mgf1: { md: forge.md.sha256.create() },
  });
  return forge.util.encode64(decrypted);
}

const ELP1 = 'ELP1';

export function aesGcmDecryptPack(bytes: Uint8Array, packKeyBase64: string): string {
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
  const keyBin = forge.util.decode64(packKeyBase64);
  const decipher = forge.cipher.createDecipher('AES-GCM', keyBin);
  decipher.start({
    iv: forge.util.createBuffer(uint8ToBinary(iv)),
    tag: forge.util.createBuffer(uint8ToBinary(tag)),
    tagLength: 128,
  });
  decipher.update(forge.util.createBuffer(uint8ToBinary(data)));
  const ok = decipher.finish();
  if (!ok) throw new Error('Pack decryption failed (bad key or corrupt file)');
  return decipher.output.toString();
}

function uint8ToBinary(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return s;
}
