import Storage from 'expo-sqlite/kv-store';

const KEY = 'expertlearner:onboarding-complete-v2';

/** In-memory latch so navigation after "Get started" isn't raced back to onboarding. */
let memoryComplete: boolean | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

/** Sync peek of the latch (true only after complete was set/read this session). */
export function peekOnboardingComplete(): boolean {
  return memoryComplete === true;
}

/** AppGate subscribes so completing onboarding flips the protected stack. */
export function subscribeOnboardingComplete(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function isOnboardingComplete(): Promise<boolean> {
  if (memoryComplete === true) return true;
  const value = await Storage.getItem(KEY);
  const done = value === '1';
  if (done) memoryComplete = true;
  return done;
}

export async function setOnboardingComplete(): Promise<void> {
  if (memoryComplete === true) return;
  memoryComplete = true;
  listeners.forEach((fn) => fn());
  await Storage.setItem(KEY, '1');
}
