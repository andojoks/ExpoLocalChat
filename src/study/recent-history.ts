import Storage from 'expo-sqlite/kv-store';

export type RecentItemKind = 'paper' | 'question';

export type RecentStudyItem = {
  /** Stable list key — `paper:{paperId}` when a paper is involved. */
  id: string;
  kind: RecentItemKind;
  title: string;
  subtitle?: string;
  href: string;
  openedAt: string;
  /** Present when this entry is (or belongs to) a paper. */
  paperId?: string;
};

const KEY = 'questionbankchat:recent-study';
/** Keep the last N unique papers (and orphan questions). */
export const RECENT_STUDY_LIMIT = 10;

function paperIdFromHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const m = href.match(/\/paper\/([^/?#]+)/);
  if (!m?.[1]) return undefined;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function paperIdFromLegacyId(id: string): string | undefined {
  const m = id.match(/^(?:paper|study):(.+)$/);
  return m?.[1] || undefined;
}

/** One entry per paper — questions under the same paper collapse here. */
export function recentDedupeKey(
  item: Pick<RecentStudyItem, 'id' | 'href' | 'paperId'>,
): string {
  const paperId =
    item.paperId || paperIdFromLegacyId(item.id) || paperIdFromHref(item.href);
  if (paperId) return `paper:${paperId}`;
  return item.id;
}

function normalizeItem(
  item: Omit<RecentStudyItem, 'openedAt'> & { openedAt?: string },
): RecentStudyItem {
  const paperId =
    item.paperId || paperIdFromLegacyId(item.id) || paperIdFromHref(item.href);
  const id = paperId ? `paper:${paperId}` : item.id;
  return {
    ...item,
    id,
    paperId,
    kind: paperId ? 'paper' : item.kind,
    openedAt: item.openedAt || new Date().toISOString(),
  };
}

/** Collapse legacy duplicates (paper: / study: / question→same paper). */
function dedupePreserveOrder(items: RecentStudyItem[]): RecentStudyItem[] {
  const seen = new Set<string>();
  const out: RecentStudyItem[] = [];
  for (const raw of items) {
    const item = normalizeItem(raw);
    const key = recentDedupeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function readAll(): Promise<RecentStudyItem[]> {
  try {
    const raw = await Storage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentStudyItem[];
    if (!Array.isArray(parsed)) return [];
    return dedupePreserveOrder(parsed);
  } catch {
    return [];
  }
}

async function writeAll(items: RecentStudyItem[]) {
  await Storage.setItem(
    KEY,
    JSON.stringify(dedupePreserveOrder(items).slice(0, RECENT_STUDY_LIMIT)),
  );
}

export async function listRecentStudy(
  limit = RECENT_STUDY_LIMIT,
): Promise<RecentStudyItem[]> {
  const all = await readAll();
  return all.slice(0, limit);
}

/**
 * Record a study open. Same paper always collapses to one row and moves to top.
 */
export async function recordRecentStudy(
  item: Omit<RecentStudyItem, 'openedAt'> & { openedAt?: string },
): Promise<void> {
  const next = normalizeItem(item);
  const key = recentDedupeKey(next);
  const prev = await readAll();
  const existing = prev.find((r) => recentDedupeKey(r) === key);
  // Keep a solid paper title when bumping from a weaker / question-flavored label.
  if (
    existing?.title &&
    next.kind === 'paper' &&
    existing.kind === 'paper' &&
    /^(question\s|q\s)/i.test(next.title) &&
    !/^(question\s|q\s)/i.test(existing.title)
  ) {
    next.title = existing.title;
  }
  const filtered = prev.filter((r) => recentDedupeKey(r) !== key);
  await writeAll([next, ...filtered]);
}
