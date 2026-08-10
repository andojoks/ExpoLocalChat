import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import {
  SUB_PAGE_BG,
  SubBanner,
  SubCard,
  SubInkHeader,
} from '@/components/subscriptions/sub-chrome';
import { listPapers } from '@/db/exam-bank';
import type { ExamPaper } from '@/domain/types';

type PaperRow = ExamPaper & { subjectName?: string; categoryCode?: string };

export default function PackHubScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { categoryCode, subjectCode, year } = useLocalSearchParams<{
    categoryCode: string;
    subjectCode: string;
    year: string;
  }>();
  const yearNum = Number(year);
  const [papers, setPapers] = useState<PaperRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjectName = papers[0]?.subjectName || String(subjectCode || '');

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await listPapers(db, {
        categoryCode: String(categoryCode || ''),
        subjectCode: String(subjectCode || ''),
        year: yearNum,
      });
      setPapers(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load papers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db, categoryCode, subjectCode, yearNum]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View className="flex-1" style={{ backgroundColor: SUB_PAGE_BG }}>
      <SubInkHeader
        title={subjectName}
        subtitle={`${year} · ${papers.length} paper${papers.length === 1 ? '' : 's'}`}
        onBack={() => router.back()}
      />

      {error ? (
        <SubBanner tone="error" icon="alert-circle-outline" body={error} />
      ) : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={papers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
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
          ListEmptyComponent={
            <SubCard>
              <View className="items-center px-5 py-8">
                <View className="mb-3 h-12 w-12 items-center justify-center rounded-2xl bg-[#EFF6FF]">
                  <Ionicons name="document-text-outline" size={22} color="#2563EB" />
                </View>
                <Text className="text-center text-[13px] text-slate-500">
                  No papers in this pack yet.
                </Text>
              </View>
            </SubCard>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/packs/[categoryCode]/[subjectCode]/[year]/paper/[paperId]',
                  params: {
                    categoryCode: String(categoryCode || ''),
                    subjectCode: String(subjectCode || ''),
                    year: String(year || ''),
                    paperId: item.id,
                  },
                })
              }
              className="mb-3"
            >
              <SubCard>
                <View className="flex-row items-center gap-3.5 px-4 py-4">
                  <View className="h-11 w-11 items-center justify-center rounded-[14px] bg-[#EFF6FF]">
                    <Text className="text-sm font-black text-[#1D4ED8]">P{item.paperNumber}</Text>
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
                      {item.title || `Paper ${item.paperNumber}`}
                    </Text>
                    <Text className="mt-0.5 text-[12px] text-slate-500" numberOfLines={1}>
                      {item.reference || `Paper ${item.paperNumber}`}
                      {item.durationMinutes ? ` · ${item.durationMinutes} min` : ''}
                    </Text>
                  </View>
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-[#F1F5F9]">
                    <Ionicons name="chevron-forward" size={15} color="#94A3B8" />
                  </View>
                </View>
              </SubCard>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
