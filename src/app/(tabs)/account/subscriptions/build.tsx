import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchBuilderCatalog,
  listMyPacks,
  saveLearnerPack,
  type BuilderCategory,
} from '@/subscription/api';
import {
  cacheGetCatalog,
  cacheGetPacks,
  cacheSetCatalog,
  cacheSetPack,
  cacheSetPacks,
} from '@/subscription/cache';
import { CourseSearchPicker } from '@/components/subscriptions/course-search-picker';
import {
  SUB_PAGE_BG,
  SubBanner,
  SubCard,
  SubEyebrow,
  SubFooterBar,
  SubInkHeader,
  SubPrimaryButton,
} from '@/components/subscriptions/sub-chrome';

type Step = 1 | 2 | 3;

export default function BuildPackScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [categories, setCategories] = useState<BuilderCategory[]>([]);
  const [ownedCategoryIds, setOwnedCategoryIds] = useState<Set<string>>(new Set());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    setError(null);
    const refresh = !!opts?.refresh;

    const [cachedCatalog, cachedPacks] = await Promise.all([
      cacheGetCatalog(),
      cacheGetPacks(),
    ]);
    if (cachedCatalog?.length) setCategories(cachedCatalog);
    if (cachedPacks?.length) {
      setOwnedCategoryIds(new Set(cachedPacks.map((p) => p.examCategoryId)));
    }
    if (cachedCatalog?.length || cachedPacks?.length) setLoading(false);

    const needCatalog = refresh || !cachedCatalog?.length;
    const needPacks = refresh || !cachedPacks?.length;
    if (!needCatalog && !needPacks) {
      setLoading(false);
      return;
    }

    try {
      const tasks: Promise<void>[] = [];
      if (needCatalog) {
        tasks.push(
          fetchBuilderCatalog().then(async (catalog) => {
            const cats = catalog.categories || [];
            setCategories(cats);
            await cacheSetCatalog(cats);
          }),
        );
      }
      if (needPacks) {
        tasks.push(
          listMyPacks().then(async (mine) => {
            const packs = mine.packs || [];
            setOwnedCategoryIds(new Set(packs.map((p) => p.examCategoryId)));
            await cacheSetPacks(packs);
          }),
        );
      }
      await Promise.all(tasks);
    } catch (e) {
      if (!cachedCatalog?.length) {
        setError(e instanceof Error ? e.message : 'Failed to load catalog');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const available = useMemo(
    () => categories.filter((c) => !ownedCategoryIds.has(c.id)),
    [categories, ownedCategoryIds],
  );

  const category = useMemo(
    () => categories.find((c) => c.id === categoryId) || null,
    [categories, categoryId],
  );

  const max = category?.maxSelectableCourses ?? 0;

  const selectedCourses = useMemo(() => {
    if (!category) return [];
    return category.courses.filter((c) => selected.includes(c.id));
  }, [category, selected]);

  function goBack() {
    if (step === 1) {
      router.navigate('/(tabs)/account/subscriptions' as never);
      return;
    }
    setError(null);
    setStep((s) => (s === 3 ? 2 : 1));
  }

  function toggleCourse(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= max) return prev;
      return [...prev, id];
    });
  }

  async function onSave() {
    if (!categoryId || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const pack = await saveLearnerPack(categoryId, selected);
      await cacheSetPack(pack);
      const packs = (await cacheGetPacks()) || [];
      if (!packs.some((p) => p.id === pack.id)) {
        await cacheSetPacks([...packs, pack]);
      }
      router.replace('/(tabs)/account/subscriptions' as never);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Failed to save pack. Connect to the internet to create a pack.',
      );
    } finally {
      setBusy(false);
    }
  }

  const stepTitle =
    step === 1 ? 'Choose category' : step === 2 ? 'Select courses' : 'Confirm pack';

  return (
    <View className="flex-1" style={{ backgroundColor: SUB_PAGE_BG }}>
      <SubInkHeader
        title="Add pack"
        subtitle={`Step ${step} of 3 · ${stepTitle}`}
        onBack={goBack}
        footer={
          <View className="flex-row gap-2">
            {([1, 2, 3] as const).map((n) => (
              <View
                key={n}
                className="h-1.5 flex-1 rounded-full"
                style={{ backgroundColor: n <= step ? '#2563EB' : 'rgba(148,163,184,0.35)' }}
              />
            ))}
          </View>
        }
      />

      {error ? <SubBanner tone="error" icon="alert-circle-outline" body={error} /> : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2563EB" />
        </View>
      ) : (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 20, paddingBottom: 28 }}
            keyboardShouldPersistTaps="handled"
          >
            {step === 1 ? (
              <View>
                <SubEyebrow>Category</SubEyebrow>
                <Text className="mb-4 text-[14px] leading-5 text-slate-500">
                  Pick the exam category for your new pack. You can have one pack per category.
                </Text>
                {available.length === 0 ? (
                  <SubCard>
                    <View className="px-5 py-6">
                      <Text className="text-center text-[14px] text-slate-500">
                        You already have a pack for every available category.
                      </Text>
                    </View>
                  </SubCard>
                ) : (
                  <View className="gap-3">
                    {available.map((c) => {
                      const on = c.id === categoryId;
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => {
                            setCategoryId(c.id);
                            setSelected([]);
                            setSearch('');
                            setError(null);
                          }}
                        >
                          <SubCard>
                            <View
                              className="flex-row items-center gap-3 px-4 py-4"
                              style={{
                                backgroundColor: on ? '#F8FBFF' : '#FFFFFF',
                              }}
                            >
                              <View
                                className="h-11 w-11 items-center justify-center rounded-[14px]"
                                style={{
                                  backgroundColor: on ? '#EFF6FF' : '#F1F5F9',
                                  borderWidth: 1,
                                  borderColor: on ? '#BFDBFE' : '#E8EEF4',
                                }}
                              >
                                <Text
                                  className="text-[12px] font-black"
                                  style={{ color: on ? '#2563EB' : '#64748B' }}
                                >
                                  {c.code.slice(0, 2).toUpperCase()}
                                </Text>
                              </View>
                              <View className="min-w-0 flex-1">
                                <Text className="text-[15px] font-bold text-ink">{c.name}</Text>
                                <Text className="mt-0.5 text-[12px] text-slate-500">
                                  up to {c.maxSelectableCourses} courses
                                  {c.sku
                                    ? ` · ${(c.sku.priceCents / 100).toFixed(0)} / ${c.sku.durationDays}d`
                                    : ''}
                                </Text>
                              </View>
                              <Ionicons
                                name={on ? 'radio-button-on' : 'radio-button-off'}
                                size={22}
                                color="#2563EB"
                              />
                            </View>
                          </SubCard>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : null}

            {step === 2 && category ? (
              <CourseSearchPicker
                courses={category.courses}
                selected={selected}
                max={max}
                search={search}
                onSearchChange={setSearch}
                onToggle={toggleCourse}
              />
            ) : null}

            {step === 3 && category ? (
              <View>
                <SubEyebrow>Review</SubEyebrow>
                <SubCard className="mb-4">
                  <View className="px-4 py-4">
                    <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
                      Category
                    </Text>
                    <Text className="mt-1 text-[16px] font-bold text-ink">{category.name}</Text>
                    <Text className="mt-0.5 text-[12px] text-slate-500">{category.code}</Text>
                  </View>
                </SubCard>
                <SubEyebrow>{`Courses (${selectedCourses.length})`}</SubEyebrow>
                <View className="gap-2.5">
                  {selectedCourses.map((c) => (
                    <SubCard key={c.id}>
                      <View className="flex-row items-center gap-3 px-4 py-3.5">
                        <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-[#EFF6FF]">
                          <Ionicons name="book-outline" size={18} color="#2563EB" />
                        </View>
                        <View className="min-w-0 flex-1">
                          <Text className="text-[15px] font-semibold text-ink">{c.name}</Text>
                          <Text className="mt-0.5 text-[12px] text-slate-500">{c.code}</Text>
                        </View>
                      </View>
                    </SubCard>
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>

          <SubFooterBar>
            {step === 1 ? (
              <SubPrimaryButton
                label="Continue"
                disabled={!categoryId}
                onPress={() => setStep(2)}
              />
            ) : null}
            {step === 2 ? (
              <SubPrimaryButton
                label="Review selection"
                disabled={selected.length === 0}
                onPress={() => setStep(3)}
              />
            ) : null}
            {step === 3 ? (
              <SubPrimaryButton
                label={busy ? 'Saving…' : 'Save pack'}
                disabled={busy || selected.length === 0}
                onPress={() => void onSave()}
              />
            ) : null}
          </SubFooterBar>
        </>
      )}
    </View>
  );
}
