import { comparePackVersions, needsPackUpdate } from '@/packs/version';

describe('pack versioning', () => {
  it('compares semver-like pack versions', () => {
    expect(comparePackVersions('2024.1.0', '2024.1.0')).toBe(0);
    expect(comparePackVersions('2024.1.1', '2024.1.0')).toBeGreaterThan(0);
    expect(comparePackVersions('2024.1.0', '2024.2.0')).toBeLessThan(0);
    expect(comparePackVersions('2025.1.0', '2024.9.9')).toBeGreaterThan(0);
  });

  it('detects missing install as needing update', () => {
    expect(
      needsPackUpdate(null, { version: '2024.1.0', checksumSha256: 'abc' }),
    ).toBe(true);
  });

  it('detects checksum drift as update', () => {
    expect(
      needsPackUpdate(
        { version: '2024.1.0', checksum: 'old' },
        { version: '2024.1.0', checksumSha256: 'new' },
      ),
    ).toBe(true);
  });

  it('detects newer remote version', () => {
    expect(
      needsPackUpdate(
        { version: '2024.1.0', checksum: 'same' },
        { version: '2024.1.1', checksumSha256: 'same' },
      ),
    ).toBe(true);
  });

  it('is up to date when version and checksum match', () => {
    expect(
      needsPackUpdate(
        { version: '2024.1.0', checksum: 'abc' },
        { version: '2024.1.0', checksumSha256: 'abc' },
      ),
    ).toBe(false);
  });
});
