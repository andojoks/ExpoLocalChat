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
  SubEyebrow,
  SubFooterBar,
  SubInkHeader,
  SubPrimaryButton,
} from '@/components/subscriptions/sub-chrome';
import { LABEL_TEXT_ANDROID } from '@/components/ui/app-text';
import { BRAND_BLUE } from '@/theme/brand';

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
          <ActivityIndicator color="#0548E8" />
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
                tintColor="#0548E8"
              />
            }
          >
            <SubEyebrow>Your packs</SubEyebrow>

            {packs.length === 0 ? (
              <View
                className="rounded-[24px] bg-white px-5 py-8"
                style={{
                  borderWidth: 1,
                  borderColor: '#E8EEF4',
                  shadowColor: '#0B1424',
                  shadowOpacity: 0.05,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 2,
                }}
              >
                <View className="items-center">
                  <View
                    className="mb-3 h-12 w-12 items-center justify-center rounded-[14px]"
                    style={{ backgroundColor: '#EFF6FF' }}
                  >
                    <Ionicons name="albums-outline" size={22} color={BRAND_BLUE} />
                  </View>
                  <Text className="text-center text-[16px] font-bold text-ink">No packs yet</Text>
                  <Text className="mt-1.5 text-center text-[13px] leading-5 text-slate-500">
                    Tap Add pack to choose a category and courses.
                  </Text>
                </View>
              </View>
            ) : (
              <View className="gap-3.5">
                {packs.map((p) => {
                  const status = packStatus(p);
                  const meta = statusMeta(status);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() =>
                        router.push(`/(tabs)/account/subscriptions/${p.id}` as never)
                      }
                      className="rounded-[24px] bg-white px-4 py-4"
                      style={{
                        borderWidth: 1,
                        borderColor: '#E8EEF4',
                        shadowColor: '#0B1424',
                        shadowOpacity: 0.05,
                        shadowRadius: 16,
                        shadowOffset: { width: 0, height: 6 },
                        elevation: 2,
                      }}
                    >
                      <View className="min-w-0">
                        <View className="flex-row items-center gap-2">
                          <Text
                            className="min-w-0 flex-1 text-[16px] font-bold tracking-tight text-ink"
                            numberOfLines={1}
                            style={LABEL_TEXT_ANDROID}
                          >
                            {p.category.name}
                          </Text>
                          <View
                            className="rounded-full px-2.5 py-1"
                            style={{ backgroundColor: meta.wash }}
                          >
                            <Text
                              className="text-[10px] font-bold uppercase tracking-wide"
                              style={[LABEL_TEXT_ANDROID, { color: meta.tone }]}
                            >
                              {meta.label}
                            </Text>
                          </View>
                        </View>

                        {status === 'active' && p.activeSubscription ? (
                          <Text className="mt-1.5 text-[13px] text-slate-500">
                            {formatDaysLeft(p.activeSubscription.expiresAt)}
                            {p.activeSubscription.expiresAt
                              ? ` · ${formatDateDmY(p.activeSubscription.expiresAt)}`
                              : ''}
                          </Text>
                        ) : status === 'expired' ? (
                          <Text className="mt-1.5 text-[13px] text-slate-500">
                            Renew to restore answer unlocks
                          </Text>
                        ) : (
                          <Text className="mt-1.5 text-[13px] text-slate-500">
                            Ready to activate with MoMo
                          </Text>
                        )}

                        <Text
                          className="mt-2 text-[12px] text-[#94A3B8]"
                          numberOfLines={1}
                          style={LABEL_TEXT_ANDROID}
                        >
                          {p.courses.length} course{p.courses.length === 1 ? '' : 's'}
                          {p.courses.length
                            ? ` · ${p.courses
                                .slice(0, 2)
                                .map((c) => c.name)
                                .join(', ')}${p.courses.length > 2 ? '…' : ''}`
                            : ''}
                        </Text>
                      </View>
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
