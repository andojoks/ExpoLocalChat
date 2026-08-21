import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { CountryCode } from 'libphonenumber-js';
import {
  addCoursesToPack,
  fetchBuilderCatalog,
  getLearnerPack,
  initiateMomoPayment,
  listPaymentHistory,
  updateLearnerPackCourses,
  type BuilderCategory,
  type LearnerPackSummary,
  type MomoProvider,
  type PaymentHistoryItem,
} from '@/subscription/api';
import {
  cacheGetCatalog,
  cacheGetPack,
  cacheGetPayments,
  cacheSetCatalog,
  cacheSetPack,
  cacheSetPayments,
  paymentsForPack,
} from '@/subscription/cache';
import { CourseSearchPicker } from '@/components/subscriptions/course-search-picker';
import { PhoneField } from '@/components/auth/phone-field';
import { daysLeftUntil, formatDateDmY, formatDaysLeft } from '@/subscription/dates';
import { useAuth } from '@/auth/AuthProvider';
import {
  DEFAULT_MOMO_PHONE_COUNTRY,
  splitE164,
  toE164,
  validateRequiredPhone,
} from '@/auth/phone';
import {
  SubBanner,
  SubCard,
  SubEyebrow,
  SubFooterBar,
  SubInkHeader,
  SubPrimaryButton,
} from '@/components/subscriptions/sub-chrome';
import { StudySwipeArea } from '@/study/study-swipe-area';
import { BRAND_BLUE } from '@/theme/brand';
import { useTheme } from '@/theme/ThemeProvider';

type DetailTab = 'courses' | 'subscription';
const DETAIL_TABS: DetailTab[] = ['courses', 'subscription'];

export default function PackDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { packId, tab: tabParam } = useLocalSearchParams<{ packId: string; tab?: string }>();
  const [tab, setTab] = useState<DetailTab>(
    tabParam === 'subscription' ? 'subscription' : 'courses',
  );

  useEffect(() => {
    if (tabParam === 'subscription') setTab('subscription');
  }, [tabParam]);
  const [pack, setPack] = useState<LearnerPackSummary | null>(null);
  const [category, setCategory] = useState<BuilderCategory | null>(null);
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [baseline, setBaseline] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [provider, setProvider] = useState<MomoProvider>('MTN_MOMO');
  const initialMomoPhone = useMemo(() => {
    const fromProfile = splitE164(user?.phone);
    if (fromProfile.national) return fromProfile;
    return { country: DEFAULT_MOMO_PHONE_COUNTRY, national: '' };
  }, [user?.phone]);
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(initialMomoPhone.country);
  const [phoneNational, setPhoneNational] = useState(initialMomoPhone.national);

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
      const refresh = !!opts?.refresh;

      const [cachedPack, cachedCatalog, cachedPayments] = await Promise.all([
        cacheGetPack(packId),
        cacheGetCatalog(),
        cacheGetPayments(),
      ]);
      if (cachedPack) {
        const cat =
          cachedCatalog?.find((c) => c.id === cachedPack.examCategoryId) || null;
        applyPack(cachedPack, cat);
        setLoading(false);
      }
      if (cachedPayments?.length) {
        setPayments(paymentsForPack(cachedPayments, packId));
      }

      const needPack = refresh || !cachedPack;
      const needCatalog = refresh || !cachedCatalog?.length;
      const needPayments = refresh || !cachedPayments?.length;
      if (!needPack && !needCatalog && !needPayments) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        let nextPack = cachedPack;
        let nextCats = cachedCatalog || [];

        const tasks: Promise<void>[] = [];
        if (needPack) {
          tasks.push(
            getLearnerPack(packId).then(async (p) => {
              nextPack = p;
              await cacheSetPack(p);
            }),
          );
        }
        if (needCatalog) {
          tasks.push(
            fetchBuilderCatalog().then(async (catalog) => {
              nextCats = catalog.categories || [];
              await cacheSetCatalog(nextCats);
            }),
          );
        }
        if (needPayments) {
          tasks.push(
            listPaymentHistory().then(async (res) => {
              const all = res.payments || [];
              await cacheSetPayments(all);
              setPayments(paymentsForPack(all, packId));
            }),
          );
        }
        await Promise.all(tasks);

        if (nextPack) {
          const cat = nextCats.find((c) => c.id === nextPack!.examCategoryId) || null;
          applyPack(nextPack, cat);
        }
      } catch (e) {
        if (!cachedPack) {
          setError(e instanceof Error ? e.message : 'Failed to load pack');
        } else {
          setError(null);
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

  /** Prefer pack subscriptions; enrich missing payments from the local payments index. */
  const historyRows = useMemo(() => {
    if (packSubs.length > 0) {
      return packSubs.map((s) => {
        if (s.payment) return s;
        const fromIndex = payments.find((pay) => pay.subscription?.id === s.id);
        if (!fromIndex) return s;
        return {
          ...s,
          payment: {
            id: fromIndex.id,
            provider: fromIndex.provider,
            amountCents: fromIndex.amountCents,
            phone: fromIndex.phone,
            externalRef: fromIndex.externalRef,
            status: fromIndex.status,
            createdAt: fromIndex.createdAt,
            completedAt: fromIndex.completedAt,
          },
        };
      });
    }
    return payments.map((pay) => ({
      id: pay.subscription?.id || pay.id,
      status: pay.subscription?.status || pay.status,
      startsAt: pay.subscription?.startsAt || pay.createdAt,
      expiresAt: pay.subscription?.expiresAt ?? null,
      entitlementPackId: '',
      createdAt: pay.createdAt,
      payment: {
        id: pay.id,
        provider: pay.provider,
        amountCents: pay.amountCents,
        phone: pay.phone,
        externalRef: pay.externalRef,
        status: pay.status,
        createdAt: pay.createdAt,
        completedAt: pay.completedAt,
      },
    }));
  }, [packSubs, payments]);

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
    const phoneError = validateRequiredPhone(phoneNational, phoneCountry);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    const e164 = toE164(phoneNational, phoneCountry);
    if (!e164) {
      setError('Enter a valid phone number for the selected country');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await initiateMomoPayment({
        learnerPackId: pack.id,
        provider,
        phone: e164,
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
    <View className="flex-1 bg-canvas">
      <SubInkHeader
        title={pack?.category.name || 'Pack details'}
        subtitle={
          active
            ? `Active · ${formatDaysLeft(pack?.activeSubscription?.expiresAt)} · until ${formatDateDmY(pack?.activeSubscription?.expiresAt)}`
            : pack
              ? pack.subscriptions?.length
                ? 'Expired · renew to restore access'
                : 'Unpaid · activate to unlock'
              : undefined
        }
        onBack={() => router.navigate('/(tabs)/account/subscriptions' as never)}
        tabs={[
          { id: 'courses', label: 'Courses' },
          { id: 'subscription', label: 'Subscription' },
        ]}
        activeTab={tab}
        onTabChange={(id) => setTab(id as DetailTab)}
      />

      {error ? (
        <SubBanner tone="error" icon="alert-circle-outline" body={error} />
      ) : null}
      {message ? (
        <SubBanner tone="info" icon="checkmark-circle-outline" body={message} />
      ) : null}

      <StudySwipeArea
        enabled={Boolean(pack && category)}
        onSwipeLeft={() => {
          const i = DETAIL_TABS.indexOf(tab);
          if (i >= 0 && i < DETAIL_TABS.length - 1) setTab(DETAIL_TABS[i + 1]!);
        }}
        onSwipeRight={() => {
          const i = DETAIL_TABS.indexOf(tab);
          if (i > 0) setTab(DETAIL_TABS[i - 1]!);
        }}
        style={{ flex: 1 }}
      >
      {loading && !pack ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={BRAND_BLUE} />
        </View>
      ) : !pack || !category ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-muted">
            Pack not found. Connect once to sync.
          </Text>
        </View>
      ) : tab === 'courses' ? (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 20, paddingBottom: 28 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void load({ refresh: true });
                }}
                tintColor={BRAND_BLUE}
              />
            }
          >
            {active ? (
              <SubCard className="mb-4">
                <View className="flex-row items-start gap-3 px-4 py-4">
                  <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-icon-bg">
                    <Ionicons name="lock-closed-outline" size={18} color={BRAND_BLUE} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15px] font-bold text-ink">Courses locked</Text>
                    <Text className="mt-1 text-[13px] leading-5 text-muted">
                      Your subscription is active. You can add courses now; removing courses unlocks
                      when it expires
                      {pack.activeSubscription?.expiresAt
                        ? ` (${formatDateDmY(pack.activeSubscription.expiresAt)}).`
                        : '.'}
                    </Text>
                  </View>
                </View>
              </SubCard>
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

          <SubFooterBar>
            <SubPrimaryButton
              label={busy ? 'Saving…' : active ? 'Add courses' : 'Save changes'}
              disabled={busy || !dirty || selected.length === 0}
              onPress={() => void onSave()}
            />
          </SubFooterBar>
        </>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            padding: 20,
            paddingBottom: Math.max(insets.bottom, 24) + 24,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load({ refresh: true });
              }}
              tintColor={BRAND_BLUE}
            />
          }
        >
          {active && pack.activeSubscription ? (
            <SubCard className="mb-5">
              <View className="flex-row items-center gap-3 border-b border-line bg-selected px-4 py-4">
                <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: BRAND_BLUE }}>
                  <Ionicons name="shield-checkmark" size={20} color="#FFFFFF" />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[11px] font-bold uppercase" style={{ letterSpacing: 1.5, color: BRAND_BLUE }}>
                    Subscription
                  </Text>
                  <Text className="mt-0.5 text-base font-black tracking-tight text-ink">Active</Text>
                </View>
                <View className="items-end rounded-xl bg-surface px-3 py-2">
                  <Text className="text-lg font-black text-ink">
                    {(() => {
                      const d = daysLeftUntil(pack.activeSubscription.expiresAt);
                      if (d === null) return '—';
                      if (d === 0) return 'Today';
                      return `${d}d`;
                    })()}
                  </Text>
                  <Text className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
                    remaining
                  </Text>
                </View>
              </View>
              <View className="gap-2.5 px-4 py-4">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="calendar-outline" size={16} color={colors.muted} />
                  <Text className="text-[13px] text-muted">
                    {formatDateDmY(pack.activeSubscription.startsAt)}
                    {'  →  '}
                    {formatDateDmY(pack.activeSubscription.expiresAt)}
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <Ionicons name="library-outline" size={16} color={colors.muted} />
                  <Text className="min-w-0 flex-1 text-[13px] text-muted" numberOfLines={1}>
                    {pack.courses.length} course{pack.courses.length === 1 ? '' : 's'} ·{' '}
                    {pack.category.name}
                  </Text>
                </View>
              </View>
            </SubCard>
          ) : (
            <SubCard className="mb-5">
              <View className="border-b border-line px-4 py-4">
                <Text className="text-[11px] font-bold uppercase text-subtle" style={{ letterSpacing: 1.5 }}>
                  Activate access
                </Text>
                <Text className="mt-1 text-base font-black tracking-tight text-ink">
                  Pay for 30 days
                </Text>
                <Text className="mt-1 text-[13px] text-muted">
                  Amount:{' '}
                  <Text className="font-bold text-ink">
                    {category.sku ? `${(category.sku.priceCents / 100).toFixed(0)}` : '—'}
                  </Text>
                </Text>
              </View>
              <View className="px-4 py-4">
                <Text className="mb-2 text-[11px] font-semibold uppercase text-subtle" style={{ letterSpacing: 1.3 }}>
                  Payment method
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
                    className="mb-2.5 flex-row items-center justify-between rounded-2xl border px-4 py-3.5"
                    style={{
                      borderColor: provider === m.id ? colors.selectedBorder : colors.line,
                      backgroundColor: provider === m.id ? colors.selectedBg : colors.sheetBg,
                    }}
                  >
                    <Text
                      className={`font-semibold ${
                        provider === m.id ? 'text-[#1E40AF]' : 'text-ink'
                      }`}
                    >
                      {m.label}
                    </Text>
                    <Ionicons
                      name={provider === m.id ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={BRAND_BLUE}
                    />
                  </Pressable>
                ))}
                <PhoneField
                  label={
                    provider === 'MTN_MOMO'
                      ? 'MTN MoMo phone number'
                      : 'Orange MoMo phone number'
                  }
                  country={phoneCountry}
                  nationalNumber={phoneNational}
                  onCountryChange={setPhoneCountry}
                  onNationalChange={setPhoneNational}
                  placeholder={phoneCountry === 'CM' ? '6XX XXX XXX' : 'Phone number'}
                />
                <Text className="mb-3 -mt-1.5 text-[12px] leading-4 text-subtle">
                  {provider === 'MTN_MOMO'
                    ? 'Use the MTN number that will approve this MoMo charge.'
                    : 'Use the Orange number that will approve this MoMo charge.'}
                </Text>
                <SubPrimaryButton
                  label={
                    busy
                      ? 'Processing…'
                      : `Pay with ${provider === 'MTN_MOMO' ? 'MTN' : 'Orange'} MoMo`
                  }
                  disabled={busy || pack.selectedCourseIds.length === 0}
                  onPress={() => void onPay()}
                />
              </View>
            </SubCard>
          )}

          <SubEyebrow>Subscription history</SubEyebrow>
          {historyRows.length === 0 ? (
            <Text className="mb-4 text-sm text-muted">No subscriptions for this pack yet.</Text>
          ) : (
            <View className="gap-3">
              {historyRows.map((s) => {
                const pay = s.payment;
                const providerLabel =
                  pay?.provider === 'MTN_MOMO'
                    ? 'MTN MoMo'
                    : pay?.provider === 'ORANGE_MOMO'
                      ? 'Orange MoMo'
                      : pay?.provider;
                return (
                  <SubCard key={s.id}>
                    <View className="px-4 py-4">
                      <View className="flex-row items-center justify-between">
                        <Text className="font-bold text-ink">{s.status}</Text>
                        <Text className="text-xs text-muted">
                          {formatDateDmY(s.createdAt)}
                        </Text>
                      </View>
                      <Text className="mt-1 text-sm text-muted">
                        {formatDateDmY(s.startsAt)}
                        {s.expiresAt ? ` → ${formatDateDmY(s.expiresAt)}` : ''}
                        {s.status === 'ACTIVE' && s.expiresAt
                          ? ` · ${formatDaysLeft(s.expiresAt)}`
                          : ''}
                      </Text>

                      <View className="mt-3 rounded-2xl border border-line bg-surface-muted px-3 py-2.5">
                        <Text className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
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
                                  pay.status === 'SUCCESS' ? 'text-forest' : 'text-subtle'
                                }`}
                              >
                                {pay.status}
                              </Text>
                            </View>
                            <Text className="mt-0.5 text-xs text-muted">
                              {(pay.amountCents / 100).toFixed(0)}
                              {pay.phone ? ` · ${pay.phone}` : ''}
                              {' · '}
                              {formatDateDmY(pay.completedAt || pay.createdAt)}
                            </Text>
                            <Text
                              className="mt-0.5 font-mono text-[10px] text-subtle"
                              numberOfLines={1}
                            >
                              {pay.externalRef}
                            </Text>
                          </>
                        ) : (
                          <Text className="mt-1 text-sm text-subtle">No payment record</Text>
                        )}
                      </View>
                    </View>
                  </SubCard>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
      </StudySwipeArea>
    </View>
  );
}
