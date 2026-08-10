import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/auth/AuthProvider';
import { useFloatingTabClearance } from '@/components/app-tab-bar';
import { HomeWelcome } from '@/components/home/home-welcome';
import {
  HomePacksSection,
  packHomeStatus,
  type PackHomeStatus,
} from '@/components/home/home-packs';
import { HomeRecentSection } from '@/components/home/home-recent';
import { listMyPacks, type LearnerPackSummary } from '@/subscription/api';
import { cacheGetPacks, cacheSetPacks } from '@/subscription/cache';
import {
  cacheGetStreak,
  cacheSetStreak,
  fetchStreak,
  type StreakSnapshot,
} from '@/study/streak-api';
import {
  listRecentStudy,
  RECENT_STUDY_LIMIT,
  type RecentStudyItem,
} from '@/study/recent-history';

function welcomeName(user: { name?: string | null; email?: string | null } | null) {
  const name = user?.name?.trim();
  if (name) return name.split(/\s+/)[0];
  const email = user?.email?.trim();
  if (email) {
    const local = email.split('@')[0];
    if (local) return local;
  }
  return 'there';
}

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabClearance = useFloatingTabClearance();

  const [packs, setPacks] = useState<LearnerPackSummary[]>([]);
  const [streak, setStreak] = useState<StreakSnapshot | null>(null);
  const [recent, setRecent] = useState<RecentStudyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (_opts?: { refresh?: boolean }) => {
    const [cachedPacks, cachedStreak, recentItems] = await Promise.all([
      cacheGetPacks(),
      cacheGetStreak(),
      listRecentStudy(RECENT_STUDY_LIMIT),
    ]);
    if (cachedPacks?.length) setPacks(cachedPacks);
    if (cachedStreak) setStreak(cachedStreak);
    setRecent(recentItems);
    if (cachedPacks?.length || cachedStreak) setLoading(false);

    await Promise.allSettled([
      listMyPacks().then(async (mine) => {
        const next = mine.packs || [];
        setPacks(next);
        await cacheSetPacks(next);
      }),
      fetchStreak().then(async (s) => {
        setStreak(s);
        await cacheSetStreak(s);
      }),
    ]);

    setRecent(await listRecentStudy(RECENT_STUDY_LIMIT));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const name = useMemo(() => welcomeName(user), [user]);
  const initial = useMemo(
    () => (user?.name || user?.email || '?').slice(0, 1).toUpperCase(),
    [user],
  );
  const activePackCount = useMemo(
    () => packs.filter((p) => packHomeStatus(p) === 'active').length,
    [packs],
  );

  const openPack = useCallback(
    (pack: LearnerPackSummary, _status: PackHomeStatus) => {
      router.push(`/(tabs)/account/subscriptions/${pack.id}` as never);
    },
    [router],
  );

  return (
    <View className="flex-1 bg-[#E8EEF5]">
      <StatusBar style="light" />
      {loading && packs.length === 0 && !streak ? (
        <View className="flex-1 items-center justify-center bg-[#0B1424]">
          <ActivityIndicator color="#38BDF8" />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: tabClearance }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load({ refresh: true });
              }}
              tintColor="#38BDF8"
              progressViewOffset={insets.top}
            />
          }
        >
          <HomeWelcome
            name={name}
            initial={initial}
            streak={streak}
            activePackCount={activePackCount}
            topInset={insets.top}
          />

          <View className="bg-[#E8EEF5] px-5 pt-6">
            <HomePacksSection
              packs={packs}
              onOpenPack={openPack}
              onCreatePack={() =>
                router.push('/(tabs)/account/subscriptions/build' as never)
              }
              onManagePacks={() =>
                router.push('/(tabs)/account/subscriptions' as never)
              }
            />

            <HomeRecentSection
              items={recent}
              onOpen={(item) => router.push(item.href as never)}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}
