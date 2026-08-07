/** Compare pack versions like `2024.1.0`. Returns >0 if a>b, <0 if a<b, 0 if equal. */
export function comparePackVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number(x));
  const pb = b.split('.').map((x) => Number(x));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const na = Number.isFinite(pa[i]) ? pa[i]! : 0;
    const nb = Number.isFinite(pb[i]) ? pb[i]! : 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

export function needsPackUpdate(
  installed: { version: string; checksum: string } | null | undefined,
  remote: { version: string; checksumSha256: string },
): boolean {
  if (!installed) return true;
  if (installed.checksum && remote.checksumSha256 && installed.checksum !== remote.checksumSha256) {
    return true;
  }
  return comparePackVersions(remote.version, installed.version) > 0;
}
