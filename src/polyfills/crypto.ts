type CryptoLike = {
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
  randomUUID?: () => string;
  subtle?: unknown;
};

const root = globalThis as typeof globalThis & { crypto?: CryptoLike };

if (!root.crypto) {
  Object.defineProperty(root, 'crypto', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: {},
  });
}

if (!root.crypto!.getRandomValues) {
  root.crypto!.getRandomValues = function getRandomValues<T extends ArrayBufferView | null>(
    array: T,
  ): T {
    if (!array) return array;
    const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    for (let index = 0; index < view.length; index += 1) {
      view[index] = Math.floor(Math.random() * 256);
    }
    return array;
  };
}

if (!root.crypto!.randomUUID) {
  root.crypto!.randomUUID = () => {
    const bytes = new Uint8Array(16);
    root.crypto!.getRandomValues!(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
}

export {};
