import Storage from 'expo-sqlite/kv-store';

const KEY = 'expertlearner:pref-autodownload-pack-images';

/** Default true after install when the preference has never been set. */
export async function getAutodownloadPackImages(): Promise<boolean> {
  try {
    const value = await Storage.getItem(KEY);
    if (value == null) return true;
    return value === '1';
  } catch {
    return true;
  }
}

export async function setAutodownloadPackImages(enabled: boolean): Promise<void> {
  await Storage.setItem(KEY, enabled ? '1' : '0');
}
