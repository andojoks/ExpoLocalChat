import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { AppScreenHeader } from '@/components/screen-header';
import {
  downloadPackJson,
  getPackDetail,
  listCatalogPacks,
} from '@/packs/catalog-client';
import {
  importExamPackFromJson,
  listInstalledPacks,
  removeInstalledPack,
} from '@/packs/import-pack';
import type { CatalogPack, InstalledPack } from '@/packs/types';

type CourseGroup = {
  subjectCode: string;
  subjectName: string;
  byYear: Map<number, CatalogPack[]>;
};

function installKey(p: { categoryCode: string; subjectCode: string; year: number }) {
  return `${p.categoryCode}:${p.subjectCode}:${p.year}`;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

export default function PacksCatalogScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [packs, setPacks] = useState<CatalogPack[]>([]);
  const [installed, setInstalled] = useState<InstalledPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const installedMap = useMemo(() => {
    const m = new Map<string, InstalledPack>();
    for (const p of installed) m.set(installKey(p), p);
    return m;
  }, [installed]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [catalog, local] = await Promise.all([listCatalogPacks(), listInstalledPacks(db)]);
      setPacks(catalog);
      setInstalled(local);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load packs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const cats = new Map<string, { code: string; name: string; courses: Map<string, CourseGroup> }>();
    for (const pack of packs) {
      const catKey = pack.category.code;
      if (!cats.has(catKey)) cats.set(catKey, { code: catKey, name: pack.category.name, courses: new Map() });
      const cat = cats.get(catKey)!;
      const courseKey = pack.subject.code;
      if (!cat.courses.has(courseKey)) {
        cat.courses.set(courseKey, {
          subjectCode: pack.subject.code,
          subjectName: pack.subject.name,
          byYear: new Map(),
        });
      }
      const course = cat.courses.get(courseKey)!;
      if (!course.byYear.has(pack.year)) course.byYear.set(pack.year, []);
      course.byYear.get(pack.year)!.push(pack);
    }
    return [...cats.values()].map((cat) => ({
      code: cat.code,
      name: cat.name,
      courses: [...cat.courses.values()].map((c) => ({
        ...c,
        years: [...c.byYear.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([year, items]) => ({
            year,
            pack: items.sort((a, b) => compareVersions(b.version, a.version))[0],
          })),
      })),
    }));
  }, [packs]);

  function openPack(pack: CatalogPack) {
    router.push({
      pathname: '/(tabs)/packs/[categoryCode]/[subjectCode]/[year]',
      params: {
        categoryCode: pack.category.code,
        subjectCode: pack.subject.code,
        year: String(pack.year),
      },
    });
  }

  async function installOrUpdate(pack: CatalogPack) {
    const key = installKey({
      categoryCode: pack.category.code,
      subjectCode: pack.subject.code,
      year: pack.year,
    });
    setBusyKey(key);
    setError(null);
    setMessage(null);
    try {
      const detail = await getPackDetail(pack.subject.code, pack.year, pack.category.code);
      const body = await downloadPackJson(detail.downloadUrl);
      const result = await importExamPackFromJson(db, body, detail.checksumSha256 || pack.checksumSha256);
      setMessage(`Installed ${result.subjectCode} ${result.year} v${result.version}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Install failed');
    } finally {
      setBusyKey(null);
    }
  }

  async function removePack(pack: CatalogPack) {
    const key = installKey({
      categoryCode: pack.category.code,
      subjectCode: pack.subject.code,
      year: pack.year,
    });
    setBusyKey(key);
    setError(null);
    try {
      await removeInstalledPack(db, pack.category.code, pack.subject.code, pack.year);
      setMessage('Pack removed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <View className="flex-1 bg-[#EEF4F8]">
      <AppScreenHeader title="Packs" />

      {error ? (
        <View className="mx-5 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <Text className="text-sm text-red-700">{error}</Text>
        </View>
      ) : null}
      {message ? (
        <View className="mx-5 mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
          <Text className="text-sm text-blue-800">{message}</Text>
        </View>
      ) : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2563EB" />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-5 pt-3"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor="#2563EB"
            />
          }
        >
          {grouped.length === 0 ? (
            <View className="items-center px-6 py-16">
              <View className="mb-4 h-14 w-14 items-center justify-center rounded-md bg-mint">
                <Ionicons name="library-outline" size={26} color="#2563EB" />
              </View>
              <Text className="text-center text-base font-bold text-ink">No pack content yet</Text>
              <Text className="mt-2 text-center text-sm leading-5 text-slate-500">
                Subscribe to courses in Settings. Only your selected pack manifests appear here.
              </Text>
              <Pressable
                onPress={() => router.push('/(tabs)/settings/subscriptions')}
                className="mt-5 rounded-md bg-forest px-5 py-3"
              >
                <Text className="font-bold text-white">Open subscriptions</Text>
              </Pressable>
            </View>
          ) : (
            grouped.map((cat) => (
              <View key={cat.code} className="mb-5">
                <Pressable
                  onPress={() => setExpanded((e) => (e === cat.code ? null : cat.code))}
                  className="mb-2 flex-row items-center justify-between"
                >
                  <Text className="text-base font-semibold text-ink">{cat.name}</Text>
                  <Ionicons
                    name={expanded === cat.code || expanded === null ? 'chevron-down' : 'chevron-forward'}
                    size={18}
                    color="#64748B"
                  />
                </Pressable>
                {(expanded === null || expanded === cat.code) &&
                  cat.courses.map((course) => (
                    <View key={course.subjectCode} className="mb-3 ml-1">
                      <Text className="mb-1 text-sm font-medium text-slate-700">{course.subjectName}</Text>
                      {course.years.map(({ year, pack }) => {
                        const key = installKey({
                          categoryCode: pack.category.code,
                          subjectCode: pack.subject.code,
                          year,
                        });
                        const local = installedMap.get(key);
                        const busy = busyKey === key;
                        const needsUpdate =
                          local != null && compareVersions(pack.version, local.version) > 0;
                        return (
                          <View
                            key={`${pack.id}-${year}`}
                            className="mb-2 flex-row items-center justify-between rounded-md border border-line bg-white px-3.5 py-3"
                          >
                            <Pressable
                              disabled={!local}
                              onPress={() => local && openPack(pack)}
                              className="mr-2 min-w-0 flex-1"
                            >
                              <Text className="text-sm font-medium text-ink">
                                {year} · v{pack.version}
                              </Text>
                              <Text className="text-xs text-slate-500">
                                {local
                                  ? needsUpdate
                                    ? `Installed v${local.version} — tap to open · update available`
                                    : `Installed v${local.version} — tap to open`
                                  : 'Not installed'}
                              </Text>
                            </Pressable>
                            <View className="flex-row items-center gap-2">
                              {busy ? <ActivityIndicator size="small" color="#2563EB" /> : null}
                              {local ? (
                                <>
                                  <Pressable
                                    disabled={busy}
                                    onPress={() => openPack(pack)}
                                    className="rounded-md bg-forest px-2.5 py-1.5"
                                  >
                                    <Text className="text-xs font-semibold text-white">Open</Text>
                                  </Pressable>
                                  <Pressable
                                    disabled={busy}
                                    onPress={() => void removePack(pack)}
                                    className="rounded-md border border-slate-300 px-2.5 py-1.5"
                                  >
                                    <Text className="text-xs font-medium text-slate-700">Remove</Text>
                                  </Pressable>
                                </>
                              ) : null}
                              <Pressable
                                disabled={busy}
                                onPress={() => void installOrUpdate(pack)}
                                className="rounded-md border border-forest px-2.5 py-1.5"
                              >
                                <Text className="text-xs font-semibold text-forest">
                                  {local ? (needsUpdate ? 'Update' : 'Reinstall') : 'Install'}
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ))}
              </View>
            ))
          )}
          <View className="h-8" />
        </ScrollView>
      )}
    </View>
  );
}
