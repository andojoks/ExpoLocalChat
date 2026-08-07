jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///mock-docs/',
  cacheDirectory: 'file:///mock-cache/',
  makeDirectoryAsync: jest.fn(async () => undefined),
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  downloadAsync: jest.fn(async (url: string, dest: string) => ({ status: 200, uri: dest })),
}));

import {
  collectContentAddressedUrls,
  localPathForHash,
} from '@/packs/asset-cache';

describe('asset-cache', () => {
  it('collects unique content-addressed img URLs', () => {
    const html = `
      <p><img src="https://cdn.example/assets/ca/ab/abcdef0123456789.png" /></p>
      <p><img src="https://cdn.example/assets/ca/ab/abcdef0123456789.png" /></p>
      <p><img src="https://cdn.example/assets/ca/cd/deadbeef.jpg" /></p>
    `;
    const urls = collectContentAddressedUrls(html);
    expect(urls).toHaveLength(2);
    expect(urls.some((u) => u.includes('abcdef0123456789.png'))).toBe(true);
    expect(urls.some((u) => u.includes('deadbeef.jpg'))).toBe(true);
  });

  it('builds stable local paths by hash', () => {
    const path = localPathForHash('ab', 'abcdef', 'png');
    expect(path).toContain('pack-assets/ca/ab/abcdef.png');
  });

  it('ignores non-ca images', () => {
    const urls = collectContentAddressedUrls('<img src="https://cdn.example/other/x.png" />');
    expect(urls).toHaveLength(0);
  });
});
