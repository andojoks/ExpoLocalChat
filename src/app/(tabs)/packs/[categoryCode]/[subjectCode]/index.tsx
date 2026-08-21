import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { LABEL_TEXT_ANDROID } from '@/components/ui/app-text';
import {
  SubBanner,
  SubCard,
  SubInkHeader,
} from '@/components/subscriptions/sub-chrome';
import { listPapers } from '@/db/exam-bank';
import { listCatalogPacks } from '@/packs/catalog-client';
import { cacheGetCatalogPacks, cacheSetCatalogPacks } from '@/packs/catalog-cache';
import { listInstalledPacks } from '@/packs/import-pack';
import { runPackInstall, runPackRemove } from '@/packs/pack-install-jobs';
import { compareVersions, installKey } from '@/packs/pack-utils';
import type { CatalogPack, InstalledPack } from '@/packs/types';
import { usePackInstallJob } from '@/packs/use-pack-install-jobs';
import { useTheme } from '@/theme/ThemeProvider';
import { BRAND_BLUE } from '@/theme/brand';

function PackJobIndicator({
  job,
}: {
  job: { phase: string; progress: number; error?: string } | undefined;
}) {
  const { colors } = useTheme();
  if (!job) return null;
  if (job.error) {
    return (
      <Text className="mt-2 text-[11px] font-semibold" style={{ color: colors.danger }} numberOfLines={2}>
        {job.error}
      </Text>
    );
  }
  if (job.phase === 'downloading') {
    const pct = Math.round(Math.max(0, Math.min(1, job.progress)) * 100);
    return (
      <View className="mt-2">
        <Text className="mb-1 text-[11px] font-semibold text-[#0439C4]">
          Downloading {pct}%
        </Text>
        <View className="h-1.5 overflow-hidden rounded-full bg-line">
          <View
            className="h-full rounded-full bg-[#0548E8]"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </View>
      </View>
    );
  }
  const label =
    job.phase === 'fetching'
      ? 'Preparing…'
      : job.phase === 'storing'
        ? 'Saving…'
        : job.phase === 'removing'
          ? 'Removing…'
          : 'Working…';
  return (
    <Text className="mt-2 text-[11px] font-semibold text-[#0439C4]">{label}</Text>
  );
}

function YearPackRow({
  year,
  pack,
  local,
  needsUpdate,
  paperNumbers,
  onOpen,
  onSync,
  onRemove,
}: {
  year: number;
  pack: CatalogPack;
  local?: InstalledPack;
  needsUpdate: boolean;
  paperNumbers: number[];
  onOpen: () => void;
  onSync: () => Promise<void>;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  const key = installKey({
    categoryCode: pack.category.code,
    subjectCode: pack.subject.code,
    year: pack.year,
  });
  const job = usePackInstallJob(key);
  const jobBusy = !!job && !job.error;
  const removing = jobBusy && job?.phase === 'removing';
  const [rowBusy, setRowBusy] = useState(false);

  useEffect(() => {
    if (jobBusy && !removing) setRowBusy(true);
    if (!jobBusy) setRowBusy(false);
  }, [jobBusy, removing]);

  const downloading = rowBusy && !removing;
  const busy = rowBusy || jobBusy;
  const status =
    !local
      ? ({ text: 'Not installed', tone: 'muted' } as const)
      : needsUpdate
        ? ({ text: 'Update available', tone: 'warn' } as const)
        : null;
  const showDownload = !!status || downloading;

  return (
    <SubCard className="mb-3">
      <View className="flex-row items-center gap-2 px-4 pt-4">
        <Pressable
          disabled={busy || !local}
          onPress={() => local && onOpen()}
          className="shrink-0 flex-row flex-wrap items-center gap-2 active:opacity-70"
        >
          <Text
            className="text-base font-black tracking-tight text-ink"
            style={[
              LABEL_TEXT_ANDROID,
              {
                lineHeight: 24,
                minWidth: 48,
                paddingRight: 4,
              },
            ]}
          >
            {year}
          </Text>
          {status ? (
            <View
              className="rounded-full px-2.5 py-1"
              style={{
                backgroundColor: status.tone === 'warn' ? colors.warningBg : colors.surfaceMuted,
              }}
            >
              <Text
                className="text-[10px] font-bold"
                style={[
                  LABEL_TEXT_ANDROID,
                  { color: status.tone === 'warn' ? colors.warning : colors.muted },
                ]}
              >
                {status.text}
              </Text>
            </View>
          ) : null}
        </Pressable>

        {showDownload ? (
          downloading ? (
            <View className="h-8 w-8 shrink-0 items-center justify-center rounded-[12px] bg-icon-bg">
              <ActivityIndicator size="small" color={BRAND_BLUE} />
            </View>
          ) : (
            <Pressable
              hitSlop={8}
              onPress={() => {
                setRowBusy(true);
                void onSync().finally(() => setRowBusy(false));
              }}
              accessibilityLabel={local ? 'Update pack' : 'Download pack'}
              className="h-8 w-8 shrink-0 items-center justify-center rounded-[12px] bg-icon-bg"
            >
              <Ionicons name="cloud-download-outline" size={18} color={BRAND_BLUE} />
            </Pressable>
          )
        ) : null}

        <View className="min-w-0 flex-1" />

        {local ? (
          removing ? (
            <View className="h-8 w-8 shrink-0 items-center justify-center rounded-[12px] bg-danger-bg">
              <ActivityIndicator size="small" color="#DC2626" />
            </View>
          ) : (
            <Pressable
              hitSlop={8}
              disabled={busy}
              onPress={onRemove}
              accessibilityLabel="Remove pack"
              className="h-8 w-8 shrink-0 items-center justify-center rounded-[12px] bg-danger-bg"
            >
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
            </Pressable>
          )
        ) : null}
      </View>

      <Pressable
        disabled={busy || !local}
        onPress={() => local && onOpen()}
        className="px-4 pb-4 pt-2"
      >
        {job && !job.error && job.phase !== 'removing' ? (
          <PackJobIndicator job={job} />
        ) : null}

        {local && paperNumbers.length > 0 && !downloading ? (
          <View className="mt-1 flex-row flex-wrap gap-2">
            {paperNumbers.map((n) => (
              <View
                key={n}
                className="h-9 min-w-[36px] items-center justify-center rounded-xl bg-icon-bg px-2.5"
              >
                <Text className="text-xs font-black text-[#0439C4]">P{n}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {!local && !busy ? (
          <Text className="mt-1 text-[11px] leading-4 text-subtle">
            Tap download to install this year
          </Text>
        ) : null}
      </Pressable>
    </SubCard>
  );
}

export default function CoursePacksScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const confirm = useConfirmDialog();
  const { categoryCode, subjectCode, from } = useLocalSearchParams<{
    categoryCode: string;
    subjectCode: string;
    from?: string;
  }>();

  const cat = Array.isArray(categoryCode) ? categoryCode[0] : categoryCode || '';
  const subject = Array.isArray(subjectCode) ? subjectCode[0] : subjectCode || '';
  const fromParam = Array.isArray(from) ? from[0] : from;
  const openedFromHome = fromParam === 'home';

  const [packs, setPacks] = useState<CatalogPack[]>([]);
  const [installed, setInstalled] = useState<InstalledPack[]>([]);
  const [papersByYear, setPapersByYear] = useState<Map<number, number[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const installedMap = useMemo(() => {
    const m = new Map<string, InstalledPack>();
    for (const p of installed) m.set(installKey(p), p);
    return m;
  }, [installed]);

  const loadLocalPapers = useCallback(async () => {
    const rows = await listPapers(db, {
      subjectCode: subject,
      categoryCode: cat || undefined,
    });
    const map = new Map<number, number[]>();
    for (const p of rows) {
      const list = map.get(p.year) || [];
      if (!list.includes(p.paperNumber)) list.push(p.paperNumber);
      map.set(p.year, list);
    }
    for (const [year, nums] of map) {
      map.set(
        year,
        nums.sort((a, b) => a - b),
      );
    }
    setPapersByYear(map);
  }, [db, subject, cat]);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    setError(null);
    const refresh = !!opts?.refresh;

    const [cachedCatalog, local] = await Promise.all([
      cacheGetCatalogPacks(),
      listInstalledPacks(db),
    ]);
    setInstalled(local);
    await loadLocalPapers();
    if (cachedCatalog?.length) {
      setPacks(cachedCatalog);
      setLoading(false);
    }

    if (!refresh && cachedCatalog?.length) {
      setRefreshing(false);
      return;
    }

    try {
      const catalog = await listCatalogPacks();
      setPacks(catalog);
      await cacheSetCatalogPacks(catalog);
    } catch (e) {
      if (!cachedCatalog?.length) {
        setError(e instanceof Error ? e.message : 'Failed to load packs');
      } else {
        setError(null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db, loadLocalPapers]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const coursePacks = useMemo(() => {
    const byYear = new Map<number, CatalogPack[]>();
    for (const pack of packs) {
      if (pack.category.code !== cat || pack.subject.code !== subject) continue;
      if (!byYear.has(pack.year)) byYear.set(pack.year, []);
      byYear.get(pack.year)!.push(pack);
    }
    return [...byYear.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, items]) => ({
        year,
        pack: items.sort((a, b) => compareVersions(b.version, a.version))[0],
      }));
  }, [packs, cat, subject]);

  const title = coursePacks[0]?.pack.subject.name || subject;
  const subtitle = coursePacks[0]?.pack.category.name || cat;

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

  async function syncPack(pack: CatalogPack): Promise<void> {
    try {
      await runPackInstall(db, pack);
      setError(null);
      const [local] = await Promise.all([listInstalledPacks(db), loadLocalPapers()]);
      setInstalled(local);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Install failed');
      // Still refresh in case install partially wrote data
      const local = await listInstalledPacks(db);
      setInstalled(local);
      await loadLocalPapers();
    }
  }

  function confirmRemove(pack: CatalogPack) {
    confirm.ask(
      {
        title: 'Remove pack?',
        message: `Delete ${pack.subject.code} ${pack.year} from this device? You can download it again later.`,
        confirmLabel: 'Remove',
        cancelLabel: 'Cancel',
        destructive: true,
        icon: 'trash-outline',
      },
      () => {
        void (async () => {
          setError(null);
          try {
            await runPackRemove(db, pack);
            const local = await listInstalledPacks(db);
            setInstalled(local);
            await loadLocalPapers();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Remove failed');
          }
        })();
      },
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <SubInkHeader
        title={title}
        subtitle={subtitle}
        onBack={() => {
          // Cross-tab push from Home leaves an unreliable history stack; go
          // explicitly to the origin instead of router.back().
          if (openedFromHome) {
            router.dismissTo('/(tabs)');
            return;
          }
          router.dismissTo('/(tabs)/packs');
        }}
      />

      {error ? (
        <SubBanner tone="error" icon="alert-circle-outline" body={error} />
      ) : null}

      {loading && packs.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0548E8" />
        </View>
      ) : (
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
          {coursePacks.length === 0 ? (
            <SubCard>
              <View className="items-center px-5 py-8">
                <Text className="text-center text-[16px] font-bold text-ink">No packs</Text>
                <Text className="mt-1.5 text-center text-[13px] leading-5 text-muted">
                  No year packs are available for this course yet.
                </Text>
              </View>
            </SubCard>
          ) : (
            coursePacks.map(({ year, pack }) => {
              const key = installKey({
                categoryCode: pack.category.code,
                subjectCode: pack.subject.code,
                year,
              });
              const local = installedMap.get(key);
              const needsUpdate =
                local != null && compareVersions(pack.version, local.version) > 0;

              return (
                <YearPackRow
                  key={`${pack.id}-${year}`}
                  year={year}
                  pack={pack}
                  local={local}
                  needsUpdate={needsUpdate}
                  paperNumbers={papersByYear.get(year) || []}
                  onOpen={() => openPack(pack)}
                  onSync={() => syncPack(pack)}
                  onRemove={() => confirmRemove(pack)}
                />
              );
            })
          )}
        </ScrollView>
      )}
      {confirm.dialog}
    </View>
  );
}
