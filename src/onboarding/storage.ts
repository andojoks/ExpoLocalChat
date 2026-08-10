import Storage from 'expo-sqlite/kv-store';

const KEY = 'expertlearner:onboarding-complete-v2';

/** In-memory latch so navigation after "Get started" isn't raced back to onboarding. */
let memoryComplete: boolean | null = null;

export async function isOnboardingComplete(): Promise<boolean> {
  if (memoryComplete === true) return true;
  try {
    const value = await Storage.getItem(KEY);
    const done = value === '1';
    if (done) memoryComplete = true;
    return done;
  } catch {
    return false;
  }
}

export async function setOnboardingComplete(): Promise<void> {
  memoryComplete = true;
  await Storage.setItem(KEY, '1');
}
