import Storage from 'expo-sqlite/kv-store';
import type { CatalogPack } from '@/packs/types';

const KEY = 'questionbankchat:packs:catalog';

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await Storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheGetCatalogPacks(): Promise<CatalogPack[] | null> {
  return readJson<CatalogPack[]>(KEY);
}

export async function cacheSetCatalogPacks(packs: CatalogPack[]): Promise<void> {
  await Storage.setItem(KEY, JSON.stringify(packs));
}
