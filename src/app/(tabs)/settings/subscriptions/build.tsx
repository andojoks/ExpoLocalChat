import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
import { AppScreenHeader } from '@/components/screen-header';
import { CourseSearchPicker } from './_components/course-search-picker';

type Step = 1 | 2 | 3;

export default function BuildPackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>(1);
  const [categories, setCategories] = useState<BuilderCategory[]>([]);
  const [ownedCategoryIds, setOwnedCategoryIds] = useState<Set<string>>(new Set());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineHint, setOfflineHint] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [cachedCatalog, cachedPacks] = await Promise.all([
      cacheGetCatalog(),
      cacheGetPacks(),
    ]);
    if (cachedCatalog) setCategories(cachedCatalog);
    if (cachedPacks) {
      setOwnedCategoryIds(new Set(cachedPacks.map((p) => p.examCategoryId)));
    }
    if (cachedCatalog || cachedPacks) setLoading(false);

    try {
      const [catalog, mine] = await Promise.all([fetchBuilderCatalog(), listMyPacks()]);
      const cats = catalog.categories || [];
      const packs = mine.packs || [];
      setCategories(cats);
      setOwnedCategoryIds(new Set(packs.map((p) => p.examCategoryId)));
      await Promise.all([cacheSetCatalog(cats), cacheSetPacks(packs)]);
      setOfflineHint(false);
    } catch (e) {
      if (cachedCatalog?.length) {
        setOfflineHint(true);
      } else {
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
      router.back();
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
      router.replace('/(tabs)/settings/subscriptions' as never);
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
    <View className="flex-1 bg-[#EEF4F8]">
      <AppScreenHeader
        title="Add pack"
        subtitle={`Step ${step} of 3 · ${stepTitle}`}
        onBack={goBack}
        footer={
          <View className="flex-row gap-2">
            {([1, 2, 3] as const).map((n) => (
              <View
                key={n}
                className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-forest' : 'bg-slate-200'}`}
              />
            ))}
          </View>
        }
      />

      {error ? (
        <View className="mx-4 mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
          <Text className="text-sm text-rose-700">{error}</Text>
        </View>
      ) : null}
      {offlineHint ? (
        <View className="mx-4 mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <Text className="text-sm text-amber-900">Showing cached catalog · offline</Text>
        </View>
      ) : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2563EB" />
        </View>
      ) : (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {step === 1 ? (
              <View>
                <Text className="mb-3 text-sm text-slate-600">
                  Pick the exam category for your new pack. You can have one pack per category.
                </Text>
                {available.length === 0 ? (
                  <Text className="text-sm text-slate-500">
                    You already have a pack for every available category.
                  </Text>
                ) : (
                  available.map((c) => {
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
                        className={`mb-2 rounded-md border px-4 py-3 ${
                          on ? 'border-forest bg-mint' : 'border-line bg-white'
                        }`}
                      >
                        <Text className="font-bold text-ink">{c.name}</Text>
                        <Text className="mt-0.5 text-xs text-slate-500">
                          {c.code} · up to {c.maxSelectableCourses} courses
                          {c.sku
                            ? ` · ${(c.sku.priceCents / 100).toFixed(0)} / ${c.sku.durationDays}d`
                            : ''}
                        </Text>
                      </Pressable>
                    );
                  })
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
                <View className="mb-4 rounded-md border border-line bg-white px-4 py-3">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Category
                  </Text>
                  <Text className="mt-1 font-bold text-ink">{category.name}</Text>
                  <Text className="text-xs text-slate-500">{category.code}</Text>
                </View>
                <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Courses ({selectedCourses.length})
                </Text>
                {selectedCourses.map((c) => (
                  <View
                    key={c.id}
                    className="mb-2 rounded-md border border-line bg-white px-4 py-3"
                  >
                    <Text className="font-semibold text-ink">{c.name}</Text>
                    <Text className="text-xs text-slate-500">{c.code}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <View
            className="border-t border-line bg-white px-4 pt-3"
            style={{ paddingBottom: Math.max(insets.bottom, 8) }}
          >
            {step === 1 ? (
              <Pressable
                disabled={!categoryId}
                onPress={() => setStep(2)}
                className={`items-center rounded-md py-4 ${
                  categoryId ? 'bg-forest' : 'bg-slate-300'
                }`}
              >
                <Text className="font-bold text-white">Continue</Text>
              </Pressable>
            ) : null}
            {step === 2 ? (
              <Pressable
                disabled={selected.length === 0}
                onPress={() => setStep(3)}
                className={`items-center rounded-md py-4 ${
                  selected.length === 0 ? 'bg-slate-300' : 'bg-forest'
                }`}
              >
                <Text className="font-bold text-white">Review selection</Text>
              </Pressable>
            ) : null}
            {step === 3 ? (
              <Pressable
                disabled={busy || selected.length === 0}
                onPress={() => void onSave()}
                className={`items-center rounded-md py-4 ${
                  busy || selected.length === 0 ? 'bg-slate-300' : 'bg-forest'
                }`}
              >
                <Text className="font-bold text-white">
                  {busy ? 'Saving…' : 'Save pack'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}
