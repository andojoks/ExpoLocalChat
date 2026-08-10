export function installKey(p: {
  categoryCode: string;
  subjectCode: string;
  year: number;
}) {
  return `${String(p.categoryCode).toUpperCase()}:${String(p.subjectCode).toUpperCase()}:${p.year}`;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}
