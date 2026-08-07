import Storage from 'expo-sqlite/kv-store';
import type {
  BuilderCategory,
  LearnerPackSummary,
  PaymentHistoryItem,
} from '@/subscription/api';

const PREFIX = 'questionbankchat:subscription:';

const KEYS = {
  packs: `${PREFIX}packs`,
  catalog: `${PREFIX}catalog`,
  payments: `${PREFIX}payments`,
  pack: (id: string) => `${PREFIX}pack:${id}`,
} as const;

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await Storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown) {
  await Storage.setItem(key, JSON.stringify(value));
}

export async function cacheGetPacks() {
  return readJson<LearnerPackSummary[]>(KEYS.packs);
}

export async function cacheSetPacks(packs: LearnerPackSummary[]) {
  await writeJson(KEYS.packs, packs);
  await Promise.all(packs.map((p) => writeJson(KEYS.pack(p.id), p)));
}

export async function cacheGetPack(id: string) {
  const direct = await readJson<LearnerPackSummary>(KEYS.pack(id));
  if (direct) return direct;
  const packs = await cacheGetPacks();
  return packs?.find((p) => p.id === id) ?? null;
}

export async function cacheSetPack(pack: LearnerPackSummary) {
  await writeJson(KEYS.pack(pack.id), pack);
  const packs = (await cacheGetPacks()) || [];
  const next = packs.some((p) => p.id === pack.id)
    ? packs.map((p) => (p.id === pack.id ? pack : p))
    : [...packs, pack];
  await writeJson(KEYS.packs, next);
}

export async function cacheGetCatalog() {
  return readJson<BuilderCategory[]>(KEYS.catalog);
}

export async function cacheSetCatalog(categories: BuilderCategory[]) {
  await writeJson(KEYS.catalog, categories);
}

export async function cacheGetPayments() {
  return readJson<PaymentHistoryItem[]>(KEYS.payments);
}

export async function cacheSetPayments(payments: PaymentHistoryItem[]) {
  await writeJson(KEYS.payments, payments);
}

export function paymentsForPack(payments: PaymentHistoryItem[], packId: string) {
  return payments.filter((p) => p.pack.id === packId);
}
