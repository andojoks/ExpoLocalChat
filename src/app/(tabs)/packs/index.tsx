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
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { listCatalogPacks } from '@/packs/catalog-client';
import { cacheGetCatalogPacks, cacheSetCatalogPacks } from '@/packs/catalog-cache';
import { listInstalledPacks } from '@/packs/import-pack';
import { installKey } from '@/packs/pack-utils';
import type { CatalogPack, InstalledPack } from '@/packs/types';
import { useCourseInstallActive } from '@/packs/use-pack-install-jobs';
import { listMyPacks, type LearnerPackSummary } from '@/subscription/api';
import { cacheGetPacks, cacheSetPacks } from '@/subscription/cache';
import { useFloatingTabClearance } from '@/components/app-tab-bar';
import {
  SUB_PAGE_BG,
  SubBanner,
  SubCard,
  SubInkHeader,
} from '@/components/subscriptions/sub-chrome';

type CourseRow = {
  categoryCode: string;
  categoryName: string;
  subjectCode: string;
  subjectName: string;
  packCount: number;
  installedCount: number;
};

function CatalogCourseRow({
  course,
  idx,
  onPress,
}: {
  course: CourseRow;
  idx: number;
  onPress: () => void;
}) {
  const installing = useCourseInstallActive(course.categoryCode, course.subjectCode);

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3.5 px-4 py-3.5 ${
        idx > 0 ? 'border-t border-[#E8EEF4]' : ''
      }`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-[#EFF6FF]">
        {installing ? (
          <ActivityIndicator size="small" color="#2563EB" />
        ) : (
          <Ionicons name="book-outline" size={18} color="#2563EB" />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
          {course.subjectName}
        </Text>
        <Text className="mt-0.5 text-[12px] text-slate-500">
          {installing
            ? 'Downloading packs…'
            : `${course.packCount} pack${course.packCount === 1 ? '' : 's'}${
                course.installedCount > 0
                  ? ` · ${course.installedCount} installed`
                  : ''
              }`}
        </Text>
      </View>
      <View className="h-8 w-8 items-center justify-center rounded-full bg-[#F1F5F9]">
        <Ionicons name="chevron-forward" size={15} color="#94A3B8" />
      </View>
    </Pressable>
  );
}

export default function PacksCatalogScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const tabClearance = useFloatingTabClearance();
  const [packs, setPacks] = useState<CatalogPack[]>([]);
  const [installed, setInstalled] = useState<InstalledPack[]>([]);
  const [learnerPacks, setLearnerPacks] = useState<LearnerPackSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    setError(null);
    const refresh = !!opts?.refresh;

    const [cachedCatalog, cachedLearner, local] = await Promise.all([
      cacheGetCatalogPacks(),
      cacheGetPacks(),
      listInstalledPacks(db),
    ]);
    setInstalled(local);
    if (cachedCatalog?.length) setPacks(cachedCatalog);
    if (cachedLearner?.length) setLearnerPacks(cachedLearner);
    if (cachedCatalog?.length || cachedLearner?.length || local.length) {
      setLoading(false);
    }

    const needCatalog = refresh || !cachedCatalog?.length;
    const needLearner = refresh || !cachedLearner?.length;
    if (!needCatalog && !needLearner) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const results = await Promise.allSettled([
      needCatalog
        ? listCatalogPacks().then(async (catalog) => {
            setPacks(catalog);
            await cacheSetCatalogPacks(catalog);
          })
        : Promise.resolve(),
      needLearner
        ? listMyPacks().then(async (mine) => {
            const next = mine.packs || [];
            setLearnerPacks(next);
            await cacheSetPacks(next);
          })
        : Promise.resolve(),
    ]);
    const failed = results.some((r) => r.status === 'rejected');
    if (failed) {
      if (!(cachedCatalog?.length || !needCatalog)) {
        const reason = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
        const e = reason.reason;
        setError(e instanceof Error ? e.message : 'Failed to load packs');
      } else {
        setError(null);
      }
    }
    setLoading(false);
    setRefreshing(false);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const learnerPackByCategory = useMemo(() => {
    const m = new Map<string, LearnerPackSummary>();
    for (const p of learnerPacks) m.set(p.category.code, p);
    return m;
  }, [learnerPacks]);

  const installedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const p of installed) s.add(installKey(p));
    return s;
  }, [installed]);

  const grouped = useMemo(() => {
    type Acc = {
      code: string;
      name: string;
      courses: Map<
        string,
        CourseRow & { years: Set<number>; installedYears: Set<number> }
      >;
    };
    const cats = new Map<string, Acc>();

    for (const pack of packs) {
      const catKey = pack.category.code;
      if (!cats.has(catKey)) {
        cats.set(catKey, {
          code: catKey,
          name: pack.category.name,
          courses: new Map(),
        });
      }
      const cat = cats.get(catKey)!;
      const courseKey = pack.subject.code;
      if (!cat.courses.has(courseKey)) {
        cat.courses.set(courseKey, {
          categoryCode: pack.category.code,
          categoryName: pack.category.name,
          subjectCode: pack.subject.code,
          subjectName: pack.subject.name,
          packCount: 0,
          installedCount: 0,
          years: new Set(),
          installedYears: new Set(),
        });
      }
      const course = cat.courses.get(courseKey)!;
      course.years.add(pack.year);
      if (
        installedKeys.has(
          installKey({
            categoryCode: pack.category.code,
            subjectCode: pack.subject.code,
            year: pack.year,
          }),
        )
      ) {
        course.installedYears.add(pack.year);
      }
    }

    return [...cats.values()]
      .map((cat) => ({
        code: cat.code,
        name: cat.name,
        courses: [...cat.courses.values()]
          .map(({ years, installedYears, ...row }) => ({
            ...row,
            packCount: years.size,
            installedCount: installedYears.size,
          }))
          .sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [packs, installedKeys]);

  function openCourse(course: CourseRow) {
    router.push({
      pathname: '/(tabs)/packs/[categoryCode]/[subjectCode]',
      params: {
        categoryCode: course.categoryCode,
        subjectCode: course.subjectCode,
      },
    });
  }

  function openManageCategory(categoryCode: string) {
    const pack = learnerPackByCategory.get(categoryCode);
    if (pack) {
      router.push(`/(tabs)/account/subscriptions/${pack.id}` as never);
      return;
    }
    router.push('/(tabs)/account/subscriptions/build' as never);
  }

  return (
    <View className="flex-1" style={{ backgroundColor: SUB_PAGE_BG }}>
      <SubInkHeader title="Packs" subtitle="Install and study offline" />

      {error ? (
        <SubBanner tone="error" icon="alert-circle-outline" body={error} />
      ) : null}

      {loading && packs.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2563EB" />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: tabClearance }}
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
          {grouped.length === 0 ? (
            <View className="items-center px-6 py-16">
              <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-[#0B1424]">
                <Ionicons name="library-outline" size={26} color="#FFFFFF" />
              </View>
              <Text className="text-center text-[16px] font-bold text-ink">No courses yet</Text>
              <Text className="mt-2 text-center text-[13px] leading-5 text-slate-500">
                Subscribe to courses, then install packs here for offline study.
              </Text>
              <Pressable
                onPress={() => router.push('/(tabs)/account/subscriptions')}
                className="mt-5 items-center rounded-2xl bg-[#0B1424] px-5 py-3.5"
              >
                <Text className="font-bold text-white">Open subscriptions</Text>
              </Pressable>
            </View>
          ) : (
            grouped.map((cat) => (
              <View key={cat.code} className="mb-7">
                <View className="mb-3 flex-row items-center justify-between gap-3 px-0.5">
                  <Text className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94A3B8]">
                    {cat.name}
                  </Text>
                  <Pressable hitSlop={8} onPress={() => openManageCategory(cat.code)}>
                    <Text className="text-[13px] font-semibold text-[#2563EB]">Manage</Text>
                  </Pressable>
                </View>
                <SubCard>
                  {cat.courses.map((course, idx) => (
                    <CatalogCourseRow
                      key={course.subjectCode}
                      course={course}
                      idx={idx}
                      onPress={() => openCourse(course)}
                    />
                  ))}
                </SubCard>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
