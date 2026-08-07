import * as FileSystem from 'expo-file-system';

const CA_PATH_RE = /\/assets\/ca\/([0-9a-f]{2})\/([0-9a-f]+)\.([a-z0-9]+)/gi;

export type AssetCacheStats = {
  scanned: number;
  downloaded: number;
  skipped: number;
  failed: number;
};

function packAssetsRoot(): string {
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
  return `${base}pack-assets/`;
}

export function localPathForHash(hh: string, hash: string, ext: string): string {
  return `${packAssetsRoot()}ca/${hh}/${hash}.${ext}`;
}

/** Collect unique content-addressed asset URLs from HTML fragments. */
export function collectContentAddressedUrls(...htmlFragments: Array<string | null | undefined>): string[] {
  const found = new Map<string, string>();
  for (const html of htmlFragments) {
    if (!html) continue;
    // img src="..."
    const srcRe = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;
    for (const m of html.matchAll(srcRe)) {
      const url = m[1];
      const ca = url.match(/\/assets\/ca\/([0-9a-f]{2})\/([0-9a-f]+)\.([a-z0-9]+)/i);
      if (ca) found.set(`${ca[1]}/${ca[2]}.${ca[3]}`.toLowerCase(), url);
    }
    // bare ca paths in text
    for (const m of html.matchAll(CA_PATH_RE)) {
      const key = `${m[1]}/${m[2]}.${m[3]}`.toLowerCase();
      if (!found.has(key)) {
        // rebuild absolute if we only have a path — skip without host
        if (html.includes('http')) {
          const abs = html.match(new RegExp(`https?://[^"'\\s]*/assets/ca/${m[1]}/${m[2]}\\.${m[3]}`, 'i'));
          if (abs) found.set(key, abs[0]);
        }
      }
    }
  }
  return [...found.values()];
}

export async function ensureAssetCached(url: string): Promise<{ localUri: string; downloaded: boolean }> {
  const m = url.match(/\/assets\/ca\/([0-9a-f]{2})\/([0-9a-f]+)\.([a-z0-9]+)/i);
  if (!m) throw new Error(`Not a content-addressed asset URL: ${url}`);
  const [, hh, hash, ext] = m;
  const dir = `${packAssetsRoot()}ca/${hh}/`;
  const localUri = localPathForHash(hh, hash, ext);

  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const info = await FileSystem.getInfoAsync(localUri);
  if (info.exists) {
    return { localUri, downloaded: false };
  }

  const result = await FileSystem.downloadAsync(url, localUri);
  if (result.status !== 200) {
    throw new Error(`Download failed (${result.status}) for ${url}`);
  }
  return { localUri: result.uri, downloaded: true };
}

/**
 * Download missing pack images once; rewrite HTML img src to local file:// URIs.
 */
export async function cacheAndRewriteHtml(
  html: string,
  stats?: AssetCacheStats,
): Promise<string> {
  if (!html?.trim()) return html || '';
  const urls = collectContentAddressedUrls(html);
  if (stats) stats.scanned += urls.length;

  let out = html;
  for (const url of urls) {
    try {
      const { localUri, downloaded } = await ensureAssetCached(url);
      if (stats) {
        if (downloaded) stats.downloaded += 1;
        else stats.skipped += 1;
      }
      const fileUri = localUri.startsWith('file://') ? localUri : `file://${localUri}`;
      out = out.split(url).join(fileUri);
    } catch {
      if (stats) stats.failed += 1;
    }
  }
  return out;
}

export async function cachePackHtmlAssets(
  htmlList: string[],
): Promise<{ rewritten: string[]; stats: AssetCacheStats }> {
  const stats: AssetCacheStats = { scanned: 0, downloaded: 0, skipped: 0, failed: 0 };
  // First pass: collect all URLs and download missing
  const allUrls = collectContentAddressedUrls(...htmlList);
  stats.scanned = allUrls.length;
  for (const url of allUrls) {
    try {
      const { downloaded } = await ensureAssetCached(url);
      if (downloaded) stats.downloaded += 1;
      else stats.skipped += 1;
    } catch {
      stats.failed += 1;
    }
  }
  const rewritten = [];
  for (const html of htmlList) {
    rewritten.push(await cacheAndRewriteHtml(html));
  }
  return { rewritten, stats };
}
