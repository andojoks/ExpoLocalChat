import { apiJson } from '@/api/http';
import type { CatalogPack, PackDetail } from '@/packs/types';

export async function listCatalogPacks(opts?: {
  category?: string;
  subject?: string;
}): Promise<CatalogPack[]> {
  const qs = new URLSearchParams();
  if (opts?.category) qs.set('category', opts.category);
  if (opts?.subject) qs.set('subject', opts.subject);
  const q = qs.toString();
  const data = await apiJson<{ packs: CatalogPack[] }>(`/api/catalog/packs${q ? `?${q}` : ''}`);
  return data.packs || [];
}

export async function getPackDetail(
  subjectCode: string,
  year: number,
  categoryCode: string,
): Promise<PackDetail> {
  const qs = new URLSearchParams({ category: categoryCode });
  return apiJson<PackDetail>(
    `/api/catalog/packs/${encodeURIComponent(subjectCode)}/${year}?${qs.toString()}`,
  );
}

export async function downloadPackJson(downloadUrl: string): Promise<string> {
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }
  return res.text();
}
