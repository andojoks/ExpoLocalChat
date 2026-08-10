import { apiJson } from '@/api/http';
import { decryptPackBlob } from '@/auth/device-keys';
import { ensurePackContentKey } from '@/auth/pack-key';
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

export type DownloadProgress = {
  /** Bytes received so far. */
  loaded: number;
  /** Total bytes when known (Content-Length or sizeBytes hint). */
  total: number | null;
  /** 0–1 when total known; otherwise null. */
  ratio: number | null;
};

/**
 * Stream pack bytes from a public S3 URL with optional progress.
 * Does not decrypt — call {@link decryptPackJson} after download.
 */
export async function downloadPackBytes(
  downloadUrl: string,
  opts?: {
    expectedBytes?: number | null;
    onProgress?: (p: DownloadProgress) => void;
  },
): Promise<Uint8Array> {
  if (!downloadUrl?.trim()) {
    throw new Error('Missing pack download URL');
  }
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }

  const headerTotal = Number(res.headers.get('content-length'));
  const totalHint =
    (Number.isFinite(headerTotal) && headerTotal > 0
      ? headerTotal
      : null) ??
    (opts?.expectedBytes && opts.expectedBytes > 0 ? opts.expectedBytes : null);

  const report = (loaded: number, total: number | null) => {
    opts?.onProgress?.({
      loaded,
      total,
      ratio: total && total > 0 ? Math.min(1, loaded / total) : null,
    });
  };

  const body = res.body;
  if (body && typeof (body as { getReader?: () => unknown }).getReader === 'function') {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    report(0, totalHint);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) {
        chunks.push(value);
        loaded += value.byteLength;
        report(loaded, totalHint);
      }
    }
    if (!loaded) {
      throw new Error('Downloaded pack was empty — try again or re-publish the pack');
    }
    const out = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    report(loaded, totalHint ?? loaded);
    return out;
  }

  // Fallback when streaming is unavailable
  report(0, totalHint);
  const buf = await res.arrayBuffer();
  if (!buf.byteLength) {
    throw new Error('Downloaded pack was empty — try again or re-publish the pack');
  }
  report(buf.byteLength, totalHint ?? buf.byteLength);
  return new Uint8Array(buf);
}

/** Decrypt ELP1 (or pass-through plaintext) into pack JSON text. */
export async function decryptPackJson(bytes: Uint8Array): Promise<string> {
  const packKey = await ensurePackContentKey();
  return decryptPackBlob(bytes, packKey);
}

/**
 * Download pack bytes from a public S3 URL, decrypt ELP1 if needed, return plaintext JSON.
 */
export async function downloadPackJson(
  downloadUrl: string,
  opts?: {
    expectedBytes?: number | null;
    onProgress?: (p: DownloadProgress) => void;
  },
): Promise<string> {
  const bytes = await downloadPackBytes(downloadUrl, opts);
  return decryptPackJson(bytes);
}
