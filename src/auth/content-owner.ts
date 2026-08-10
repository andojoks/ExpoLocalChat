import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import { dropPackContentKey } from '@/auth/pack-key';
import { packAssetsRoot } from '@/packs/asset-cache';

const OWNER_KEY = 'qb_content_owner_user_id';

const memory = new Map<string, string>();

async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    memory.set(key, value);
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (memory.has(key)) return memory.get(key) || null;
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function getContentOwnerUserId(): Promise<string | null> {
  const v = await getItem(OWNER_KEY);
  return v?.trim() || null;
}

export async function setContentOwnerUserId(userId: string) {
  await setItem(OWNER_KEY, userId);
}

/** Wipe all locally installed exam packs, related rows, asset cache, and pack AES key. */
export async function wipeLocalExamContent(db: SQLiteDatabase) {
  await db.execAsync(`
    DELETE FROM paper_questions;
    DELETE FROM paper_sections;
    DELETE FROM exam_questions;
    DELETE FROM exam_sections;
    DELETE FROM exam_papers;
    DELETE FROM subjects;
    DELETE FROM exam_categories;
    DELETE FROM installed_packs;
  `);

  try {
    const root = packAssetsRoot();
    if (root) {
      await FileSystem.deleteAsync(root, { idempotent: true });
    }
  } catch {
    /* ignore */
  }

  await dropPackContentKey();
}

/**
 * On login: retain packs if the same user owns them; otherwise wipe and claim ownership.
 */
export async function reconcileContentOwner(db: SQLiteDatabase, userId: string) {
  const previous = await getContentOwnerUserId();
  if (previous === userId) {
    return { wiped: false as const };
  }

  const packRow = await db.getFirstAsync<{ owner_user_id: string | null }>(
    `SELECT owner_user_id FROM installed_packs LIMIT 1`,
  );
  const hasPacks = packRow != null;

  // SecureStore miss but packs already tagged for this user — restore owner flag and keep.
  if (!previous && hasPacks && packRow.owner_user_id === userId) {
    await setContentOwnerUserId(userId);
    return { wiped: false as const };
  }

  if (hasPacks || (previous != null && previous !== userId)) {
    await wipeLocalExamContent(db);
    await setContentOwnerUserId(userId);
    return { wiped: true as const };
  }

  await setContentOwnerUserId(userId);
  return { wiped: false as const };
}
