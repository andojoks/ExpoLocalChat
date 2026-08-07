/** Ensure pack HTML uses local file:// assets; rewrite remote /assets/ca/ URLs if needed. */
import { cacheAndRewriteHtml } from '@/packs/asset-cache';
import { getApiBaseUrl } from '@/config/api';

const REMOTE_CA_RE = /https?:\/\/[^"'>\s]*\/assets\/ca\/[0-9a-f]{2}\/[0-9a-f]+\.[a-z0-9]+/i;
const RELATIVE_CA_SRC_RE = /(<img\b[^>]*\bsrc=["'])(\/assets\/ca\/[0-9a-f]{2}\/[0-9a-f]+\.[a-z0-9]+)(["'])/gi;

export function htmlNeedsLocalRewrite(html: string | null | undefined): boolean {
  if (!html?.trim()) return false;
  return REMOTE_CA_RE.test(html) || /src=["']\/assets\/ca\//i.test(html);
}

function absolutizeRelativeCa(html: string): string {
  const base = getApiBaseUrl().replace(/\/$/, '');
  return html.replace(RELATIVE_CA_SRC_RE, `$1${base}$2$3`);
}

export async function ensureLocalHtml(html: string | null | undefined): Promise<string> {
  if (!html?.trim()) return html || '';
  if (!htmlNeedsLocalRewrite(html)) return html;
  return cacheAndRewriteHtml(absolutizeRelativeCa(html));
}
