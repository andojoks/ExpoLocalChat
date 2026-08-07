import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  addCoursesToPack,
  fetchBuilderCatalog,
  getLearnerPack,
  initiateMomoPayment,
  updateLearnerPackCourses,
  type BuilderCategory,
  type LearnerPackSummary,
  type MomoProvider,
} from '@/subscription/api';
import {
  cacheGetCatalog,
  cacheGetPack,
  cacheSetCatalog,
  cacheSetPack,
} from '@/subscription/cache';
import { AppScreenHeader } from '@/components/screen-header';
import { CourseSearchPicker } from './_components/course-search-picker';
import { formatDateDmY, formatDaysLeft } from '@/subscription/dates';

type DetailTab = 'courses' | 'subscription';

export default function PackDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { packId } = useLocalSearchParams<{ packId: string }>();
  const [tab, setTab] = useState<DetailTab>('courses');
  const [pack, setPack] = useState<LearnerPackSummary | null>(null);
  const [category, setCategory] = useState<BuilderCategory | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [baseline, setBaseline] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [offlineHint, setOfflineHint] = useState(false);
  const [provider, setProvider] = useState<MomoProvider>('MTN_MOMO');
  const [phone, setPhone] = useState('');

  const applyPack = useCallback((p: LearnerPackSummary, cat: BuilderCategory | null) => {
    setPack(p);
    setSelected(p.selectedCourseIds);
    setBaseline(p.selectedCourseIds);
    setCategory(cat);
  }, []);

  const load = useCallback(
    async (opts?: { refresh?: boolean }) => {
      if (!packId) return;
      setError(null);

      if (!opts?.refresh) {
        const [cachedPack, cachedCatalog] = await Promise.all([
          cacheGetPack(packId),
          cacheGetCatalog(),
        ]);
        if (cachedPack) {
          const cat =
            cachedCatalog?.find((c) => c.id === cachedPack.examCategoryId) || null;
          applyPack(cachedPack, cat);
          setLoading(false);
        }
      }

      try {
        const [p, catalog] = await Promise.all([
          getLearnerPack(packId),
          fetchBuilderCatalog(),
        ]);
        const cats = catalog.categories || [];
        const cat = cats.find((c) => c.id === p.examCategoryId) || null;
        applyPack(p, cat);
        await Promise.all([cacheSetPack(p), cacheSetCatalog(cats)]);
        setOfflineHint(false);
      } catch (e) {
        const cached = await cacheGetPack(packId);
        if (cached) {
          setOfflineHint(true);
          setError(null);
        } else {
          setError(e instanceof Error ? e.message : 'Failed to load pack');
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [packId, applyPack],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const active = !!pack?.activeSubscription;
  const max = pack?.category.maxSelectableCourses ?? category?.maxSelectableCourses ?? 0;
  const lockedIds = useMemo(
    () => (active ? new Set(baseline) : new Set<string>()),
    [active, baseline],
  );

  const dirty = useMemo(() => {
    if (selected.length !== baseline.length) return true;
    const set = new Set(baseline);
    return selected.some((id) => !set.has(id));
  }, [selected, baseline]);

  const packSubs = useMemo(() => pack?.subscriptions || [], [pack]);

  function toggleCourse(id: string) {
    setError(null);
    setSelected((prev) => {
      if (prev.includes(id)) {
        if (lockedIds.has(id)) {
          setError('Cannot remove courses while subscription is active. Wait until it expires.');
          return prev;
        }
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= max) return prev;
      return [...prev, id];
    });
  }

  async function onSave() {
    if (!pack) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let updated: LearnerPackSummary;
      if (active) {
        const toAdd = selected.filter((id) => !baseline.includes(id));
        if (toAdd.length === 0) {
          setMessage('No new courses to add.');
          setBusy(false);
          return;
        }
        updated = await addCoursesToPack(pack.id, toAdd);
      } else {
        updated = await updateLearnerPackCourses(pack.id, selected);
      }
      applyPack(updated, category);
      await cacheSetPack(updated);
      setMessage(active ? 'Courses added.' : 'Pack updated.');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Save failed. Connect to the internet to update your pack.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onPay() {
    if (!pack) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await initiateMomoPayment({
        learnerPackId: pack.id,
        provider,
        phone: phone.trim() || undefined,
      });
      if (result.status === 'SUCCESS') {
        setMessage(`Payment successful. Subscription active for ${result.durationDays} days.`);
      } else {
        setMessage('Payment pending. Waiting for MoMo webhook…');
      }
      setTab('subscription');
      await load({ refresh: true });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Payment failed. Connect to the internet to pay.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-[#EEF4F8]">
      <AppScreenHeader
        title={pack?.category.name || 'Pack details'}
        subtitle={
          active
            ? `Active · ${formatDaysLeft(pack?.activeSubscription?.expiresAt)} · until ${formatDateDmY(pack?.activeSubscription?.expiresAt)}`
            : 'Unpaid'
        }
        onBack={() => router.back()}
        tabs={[
          { id: 'courses', label: 'Courses' },
          { id: 'subscription', label: 'Subscription' },
        ]}
        activeTab={tab}
        onTabChange={(id) => setTab(id as DetailTab)}
      />

      {offlineHint ? (
        <View className="mx-4 mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <Text className="text-sm text-amber-900">Showing cached data · offline</Text>
        </View>
      ) : null}
      {error ? (
        <View className="mx-4 mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
          <Text className="text-sm text-rose-700">{error}</Text>
        </View>
      ) : null}
      {message ? (
        <View className="mx-4 mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <Text className="text-sm text-emerald-800">{message}</Text>
        </View>
      ) : null}

      {loading && !pack ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2563EB" />
        </View>
      ) : !pack || !category ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-slate-500">
            Pack not found offline. Connect once to sync.
          </Text>
        </View>
      ) : tab === 'courses' ? (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
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
            {active ? (
              <View className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <Text className="text-sm text-amber-900">
                  Subscription is active — you can add courses only. Removals unlock when it expires.
                </Text>
              </View>
            ) : null}

            <CourseSearchPicker
              courses={category.courses}
              selected={selected}
              max={max}
              search={search}
              onSearchChange={setSearch}
              onToggle={toggleCourse}
              lockedIds={lockedIds}
              disabled={busy}
            />
          </ScrollView>

          <View
            className="border-t border-line bg-white px-4 pt-3"
            style={{ paddingBottom: Math.max(insets.bottom, 8) }}
          >
            <Pressable
              disabled={busy || !dirty || selected.length === 0}
              onPress={() => void onSave()}
              className={`items-center rounded-md py-4 ${
                busy || !dirty || selected.length === 0 ? 'bg-slate-300' : 'bg-forest'
              }`}
            >
              <Text className="font-bold text-white">
                {busy ? 'Saving…' : active ? 'Add courses' : 'Save changes'}
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            padding: 16,
            paddingBottom: Math.max(insets.bottom, 24) + 24,
          }}
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
          {active && pack.activeSubscription ? (
            <View className="mb-4 rounded-md border border-forest bg-mint px-4 py-3">
              <Text className="font-bold text-ink">Subscription active</Text>
              <Text className="mt-1 text-sm text-slate-600">
                {formatDateDmY(pack.activeSubscription.startsAt)} →{' '}
                {formatDateDmY(pack.activeSubscription.expiresAt)} ·{' '}
                {formatDaysLeft(pack.activeSubscription.expiresAt)}
              </Text>
            </View>
          ) : (
            <View className="mb-4">
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Pay & activate (30 days)
              </Text>
              <Text className="mb-2 text-sm font-semibold text-ink">
                Amount:{' '}
                {category.sku
                  ? `${(category.sku.priceCents / 100).toFixed(0)} (30 days)`
                  : '—'}
              </Text>
              {(
                [
                  { id: 'MTN_MOMO' as const, label: 'MTN MoMo' },
                  { id: 'ORANGE_MOMO' as const, label: 'Orange MoMo' },
                ] as const
              ).map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => setProvider(m.id)}
                  className={`mb-2 flex-row items-center justify-between rounded-md border px-4 py-3 ${
                    provider === m.id ? 'border-forest bg-white' : 'border-line bg-white'
                  }`}
                >
                  <Text className="font-semibold text-ink">{m.label}</Text>
                  <Ionicons
                    name={provider === m.id ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color="#2563EB"
                  />
                </Pressable>
              ))}
              <Text className="mb-1.5 mt-2 text-xs font-semibold text-slate-600">
                MoMo phone (optional)
              </Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="+237…"
                placeholderTextColor="#94A3B8"
                className="mb-3 rounded-md border border-line bg-white px-3.5 py-3 text-[15px] text-ink"
              />
              <Pressable
                disabled={busy || pack.selectedCourseIds.length === 0}
                onPress={() => void onPay()}
                className={`items-center rounded-md py-4 ${
                  busy || pack.selectedCourseIds.length === 0 ? 'bg-slate-300' : 'bg-forest'
                }`}
              >
                <Text className="font-bold text-white">
                  {busy
                    ? 'Processing…'
                    : `Pay with ${provider === 'MTN_MOMO' ? 'MTN' : 'Orange'} MoMo`}
                </Text>
              </Pressable>
            </View>
          )}

          <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Subscription history
          </Text>
          {packSubs.length === 0 ? (
            <Text className="mb-4 text-sm text-slate-500">No subscriptions for this pack yet.</Text>
          ) : (
            packSubs.map((s) => {
              const pay = s.payment;
              const providerLabel =
                pay?.provider === 'MTN_MOMO'
                  ? 'MTN MoMo'
                  : pay?.provider === 'ORANGE_MOMO'
                    ? 'Orange MoMo'
                    : pay?.provider;
              return (
                <View key={s.id} className="mb-3 rounded-md border border-line bg-white px-4 py-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="font-bold text-ink">{s.status}</Text>
                    <Text className="text-xs text-slate-500">
                      {formatDateDmY(s.createdAt)}
                    </Text>
                  </View>
                  <Text className="mt-1 text-sm text-slate-600">
                    {formatDateDmY(s.startsAt)}
                    {s.expiresAt ? ` → ${formatDateDmY(s.expiresAt)}` : ''}
                    {s.status === 'ACTIVE' && s.expiresAt
                      ? ` · ${formatDaysLeft(s.expiresAt)}`
                      : ''}
                  </Text>

                  <View className="mt-3 rounded-md border border-line bg-[#F8FAFC] px-3 py-2">
                    <Text className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Payment
                    </Text>
                    {pay ? (
                      <>
                        <View className="mt-1 flex-row items-center justify-between">
                          <Text className="text-sm font-semibold text-ink">
                            {providerLabel}
                          </Text>
                          <Text
                            className={`text-xs font-semibold ${
                              pay.status === 'SUCCESS' ? 'text-forest' : 'text-slate-400'
                            }`}
                          >
                            {pay.status}
                          </Text>
                        </View>
                        <Text className="mt-0.5 text-xs text-slate-500">
                          {(pay.amountCents / 100).toFixed(0)}
                          {pay.phone ? ` · ${pay.phone}` : ''}
                          {' · '}
                          {formatDateDmY(pay.completedAt || pay.createdAt)}
                        </Text>
                        <Text className="mt-0.5 font-mono text-[10px] text-slate-400" numberOfLines={1}>
                          {pay.externalRef}
                        </Text>
                      </>
                    ) : (
                      <Text className="mt-1 text-sm text-slate-400">No payment record</Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
