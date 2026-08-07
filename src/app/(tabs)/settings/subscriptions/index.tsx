import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchBuilderCatalog,
  listMyPacks,
  type BuilderCategory,
  type LearnerPackSummary,
} from '@/subscription/api';
import {
  cacheGetCatalog,
  cacheGetPacks,
  cacheSetCatalog,
  cacheSetPacks,
} from '@/subscription/cache';
import { formatDateDmY, formatDaysLeft } from '@/subscription/dates';
import { AppScreenHeader } from '@/components/screen-header';

export default function SubscriptionsHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [packs, setPacks] = useState<LearnerPackSummary[]>([]);
  const [categories, setCategories] = useState<BuilderCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineHint, setOfflineHint] = useState(false);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    setError(null);
    if (!opts?.refresh) {
      const [cachedPacks, cachedCatalog] = await Promise.all([
        cacheGetPacks(),
        cacheGetCatalog(),
      ]);
      if (cachedPacks) setPacks(cachedPacks);
      if (cachedCatalog) setCategories(cachedCatalog);
      if (cachedPacks || cachedCatalog) {
        setLoading(false);
      }
    }

    try {
      const [mine, catalog] = await Promise.all([listMyPacks(), fetchBuilderCatalog()]);
      const nextPacks = mine.packs || [];
      const nextCats = catalog.categories || [];
      setPacks(nextPacks);
      setCategories(nextCats);
      await Promise.all([cacheSetPacks(nextPacks), cacheSetCatalog(nextCats)]);
      setOfflineHint(false);
    } catch (e) {
      const cached = await cacheGetPacks();
      if (cached?.length) {
        setOfflineHint(true);
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load subscriptions');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const canAddPack = useMemo(() => {
    const owned = new Set(packs.map((p) => p.examCategoryId));
    return categories.some((c) => !owned.has(c.id));
  }, [packs, categories]);

  return (
    <View className="flex-1 bg-[#EEF4F8]">
      <AppScreenHeader
        title="Subscriptions"
        onBack={() => router.back()}
      />

      {offlineHint ? (
        <View className="mx-4 mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <Text className="text-sm text-amber-900">Showing cached packs · offline</Text>
        </View>
      ) : null}
      {error ? (
        <View className="mx-4 mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
          <Text className="text-sm text-rose-700">{error}</Text>
        </View>
      ) : null}

      {loading && packs.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2563EB" />
        </View>
      ) : (
        <View className="flex-1">
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void load({ refresh: true });
                }}
                tintColor="#2563EB"
              />
            }
          >
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Your packs
            </Text>
            {packs.length === 0 ? (
              <Text className="text-sm text-slate-500">
                No packs yet. Tap Add pack to choose a category and courses.
              </Text>
            ) : (
              packs.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() =>
                    router.push(`/(tabs)/settings/subscriptions/${p.id}` as never)
                  }
                  className="mb-2 rounded-md border border-line bg-white px-4 py-3"
                >
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="min-w-0 flex-1">
                      <Text className="font-bold text-ink">{p.category.name}</Text>
                      <Text className="mt-0.5 text-xs text-slate-500">
                        {p.category.code} · {p.courses.length}/{p.category.maxSelectableCourses}{' '}
                        courses
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text
                        className={`text-xs font-semibold ${
                          p.activeSubscription ? 'text-forest' : 'text-slate-400'
                        }`}
                      >
                        {p.activeSubscription
                          ? `Active · ${formatDaysLeft(p.activeSubscription.expiresAt)}`
                          : 'Unpaid'}
                      </Text>
                      {p.activeSubscription?.expiresAt ? (
                        <Text className="text-[10px] text-slate-400">
                          until {formatDateDmY(p.activeSubscription.expiresAt)}
                        </Text>
                      ) : null}
                      <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                    </View>
                  </View>
                  <Text className="mt-2 text-sm text-slate-600" numberOfLines={2}>
                    {p.courses.map((c) => c.name).join(', ') || 'No courses yet'}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>

          <View
            className="border-t border-line bg-white px-4 pt-3"
            style={{ paddingBottom: Math.max(insets.bottom, 8) }}
          >
            <Pressable
              disabled={!canAddPack}
              onPress={() => router.push('/(tabs)/settings/subscriptions/build' as never)}
              className={`items-center rounded-md py-4 ${
                canAddPack ? 'bg-forest' : 'bg-slate-300'
              }`}
            >
              <Text className="font-bold text-white">
                {canAddPack ? 'Add pack' : 'All categories have a pack'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
