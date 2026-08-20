import Storage from 'expo-sqlite/kv-store';

const KEY = 'expertlearner:onboarding-complete-v2';

/** In-memory latch so navigation after "Get started" isn't raced back to onboarding. */
let memoryComplete: boolean | null = null;

/** Sync peek of the latch (true only after complete was set/read this session). */
export function peekOnboardingComplete(): boolean {
  return memoryComplete === true;
}

export async function isOnboardingComplete(): Promise<boolean> {
  if (memoryComplete === true) return true;
  const value = await Storage.getItem(KEY);
  const done = value === '1';
  if (done) memoryComplete = true;
  return done;
}

export async function setOnboardingComplete(): Promise<void> {
  memoryComplete = true;
  await Storage.setItem(KEY, '1');
}
