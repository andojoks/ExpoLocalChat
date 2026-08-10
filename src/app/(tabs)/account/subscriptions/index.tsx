import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
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
import {
  SUB_PAGE_BG,
  SubBanner,
  SubCard,
  SubEyebrow,
  SubFooterBar,
  SubInkHeader,
  SubPrimaryButton,
} from '@/components/subscriptions/sub-chrome';

function packStatus(pack: LearnerPackSummary) {
  if (pack.activeSubscription) return 'active' as const;
  if (pack.subscriptions?.length) return 'expired' as const;
  return 'unpaid' as const;
}

function statusMeta(status: 'active' | 'expired' | 'unpaid') {
  if (status === 'active') {
    return { label: 'Active', tone: '#0F766E', wash: '#ECFDF5' };
  }
  if (status === 'expired') {
    return { label: 'Expired', tone: '#B45309', wash: '#FFFBEB' };
  }
  return { label: 'Unpaid', tone: '#64748B', wash: '#F1F5F9' };
}

export default function SubscriptionsHubScreen() {
  const router = useRouter();
  const [packs, setPacks] = useState<LearnerPackSummary[]>([]);
  const [categories, setCategories] = useState<BuilderCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    setError(null);
    const refresh = !!opts?.refresh;

    const [cachedPacks, cachedCatalog] = await Promise.all([
      cacheGetPacks(),
      cacheGetCatalog(),
    ]);
    if (cachedPacks?.length) setPacks(cachedPacks);
    if (cachedCatalog?.length) setCategories(cachedCatalog);
    if (cachedPacks?.length || cachedCatalog?.length) {
      setLoading(false);
    }

    const needPacks = refresh || !cachedPacks?.length;
    const needCatalog = refresh || !cachedCatalog?.length;
    if (!needPacks && !needCatalog) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const results = await Promise.allSettled([
      needPacks
        ? listMyPacks().then(async (mine) => {
            const nextPacks = mine.packs || [];
            setPacks(nextPacks);
            await cacheSetPacks(nextPacks);
          })
        : Promise.resolve(),
      needCatalog
        ? fetchBuilderCatalog().then(async (catalog) => {
            const nextCats = catalog.categories || [];
            setCategories(nextCats);
            await cacheSetCatalog(nextCats);
          })
        : Promise.resolve(),
    ]);
    const failed = results.some((r) => r.status === 'rejected');
    if (failed) {
      if (cachedPacks?.length || cachedCatalog?.length) {
        setError(null);
      } else {
        const reason = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
        const e = reason.reason;
        setError(e instanceof Error ? e.message : 'Failed to load subscriptions');
      }
    }
    setLoading(false);
    setRefreshing(false);
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
    <View className="flex-1" style={{ backgroundColor: SUB_PAGE_BG }}>
      <SubInkHeader
        title="Subscriptions"
        onBack={() => router.navigate('/(tabs)/account' as never)}
      />

      {error ? (
        <SubBanner tone="error" icon="alert-circle-outline" body={error} />
      ) : null}

      {loading && packs.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2563EB" />
        </View>
      ) : (
        <View className="flex-1">
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 20, paddingBottom: 28 }}
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
            <SubEyebrow>Your packs</SubEyebrow>

            {packs.length === 0 ? (
              <SubCard>
                <View className="items-center px-5 py-8">
                  <View className="mb-3 h-12 w-12 items-center justify-center rounded-2xl bg-[#0B1424]">
                    <Ionicons name="albums-outline" size={22} color="#FFFFFF" />
                  </View>
                  <Text className="text-center text-[16px] font-bold text-ink">No packs yet</Text>
                  <Text className="mt-1.5 text-center text-[13px] leading-5 text-slate-500">
                    Tap Add pack to choose a category and courses.
                  </Text>
                </View>
              </SubCard>
            ) : (
              <View className="gap-3">
                {packs.map((p) => {
                  const status = packStatus(p);
                  const meta = statusMeta(status);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() =>
                        router.push(`/(tabs)/account/subscriptions/${p.id}` as never)
                      }
                    >
                      <SubCard>
                        <View className="px-4 py-4">
                          <View className="flex-row items-start gap-3">
                            <View
                              className="h-11 w-11 items-center justify-center rounded-[14px]"
                              style={{ backgroundColor: meta.wash }}
                            >
                              <Text
                                className="text-[13px] font-black"
                                style={{ color: meta.tone }}
                              >
                                {p.category.code?.slice(0, 2).toUpperCase() || 'EL'}
                              </Text>
                            </View>
                            <View className="min-w-0 flex-1">
                              <View className="flex-row items-center gap-2">
                                <Text
                                  className="min-w-0 flex-1 text-[15px] font-bold text-ink"
                                  numberOfLines={1}
                                >
                                  {p.category.name}
                                </Text>
                                <View
                                  className="rounded-full px-2.5 py-1"
                                  style={{ backgroundColor: meta.wash }}
                                >
                                  <Text
                                    className="text-[10px] font-bold uppercase tracking-wide"
                                    style={{ color: meta.tone }}
                                  >
                                    {meta.label}
                                  </Text>
                                </View>
                              </View>
                              <Text className="mt-1 text-[12px] text-slate-500">
                                {p.courses.length}/{p.category.maxSelectableCourses} courses
                                {p.activeSubscription
                                  ? ` · ${formatDaysLeft(p.activeSubscription.expiresAt)}`
                                  : ''}
                              </Text>
                              {p.activeSubscription?.expiresAt ? (
                                <Text className="mt-0.5 text-[11px] text-slate-400">
                                  until {formatDateDmY(p.activeSubscription.expiresAt)}
                                </Text>
                              ) : null}
                              <Text
                                className="mt-2 text-[13px] text-slate-600"
                                numberOfLines={2}
                              >
                                {p.courses.map((c) => c.name).join(', ') || 'No courses yet'}
                              </Text>
                            </View>
                            <View className="h-8 w-8 items-center justify-center rounded-full bg-[#F1F5F9]">
                              <Ionicons name="chevron-forward" size={16} color="#64748B" />
                            </View>
                          </View>
                        </View>
                      </SubCard>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>

          <SubFooterBar>
            <SubPrimaryButton
              label={canAddPack ? 'Add pack' : 'All categories have a pack'}
              disabled={!canAddPack}
              onPress={() => router.push('/(tabs)/account/subscriptions/build' as never)}
            />
          </SubFooterBar>
        </View>
      )}
    </View>
  );
}
