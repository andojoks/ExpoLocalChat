import { apiJson } from '@/api/http';
import Storage from 'expo-sqlite/kv-store';

export type StreakSnapshot = {
  currentStreakDays: number;
  last7DaysActive: boolean[];
};

const STREAK_CACHE_KEY = 'questionbankchat:study:streak';

export async function fetchStreak(): Promise<StreakSnapshot> {
  return apiJson<StreakSnapshot>('/api/study/streak');
}

export async function cacheGetStreak(): Promise<StreakSnapshot | null> {
  try {
    const raw = await Storage.getItem(STREAK_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StreakSnapshot;
  } catch {
    return null;
  }
}

export async function cacheSetStreak(streak: StreakSnapshot): Promise<void> {
  await Storage.setItem(STREAK_CACHE_KEY, JSON.stringify(streak));
}

/** Fire-and-forget day ping so StudyActivityDay updates for streak. */
export async function recordStudyActivity(opts: {
  examCourseId: string;
  examPaperId?: string;
}): Promise<void> {
  if (!opts.examCourseId) return;
  try {
    await apiJson('/api/study/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examCourseId: opts.examCourseId,
        examPaperId: opts.examPaperId || undefined,
      }),
    });
  } catch {
    /* offline / unauth — ignore */
  }
}
