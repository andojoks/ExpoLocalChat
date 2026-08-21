import Storage from 'expo-sqlite/kv-store';
import type { ThemePreference } from '@/theme/tokens';

const KEY = 'expertlearner:pref-color-scheme';

export async function getThemePreference(): Promise<ThemePreference> {
  try {
    const value = await Storage.getItem(KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
    return 'system';
  } catch {
    return 'system';
  }
}

export async function setThemePreference(preference: ThemePreference): Promise<void> {
  await Storage.setItem(KEY, preference);
}
