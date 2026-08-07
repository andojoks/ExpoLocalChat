import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { listPapers } from '@/db/exam-bank';
import type { ExamPaper } from '@/domain/types';

type PaperRow = ExamPaper & { subjectName?: string; categoryCode?: string };

export default function PackHubScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const navigation = useNavigation();
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

  const title = `${String(subjectCode || '')} · ${year}`;

  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

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
    <View className="flex-1 bg-white">
      <View className="border-b border-line px-4 py-3">
        <Text className="text-sm text-slate-500">
          {papers[0]?.subjectName || String(subjectCode || '')}
        </Text>
        <Text className="text-lg font-bold text-ink">{year} papers</Text>
      </View>

      {error ? (
        <View className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <Text className="text-sm text-red-700">{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={papers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
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
            <Text className="py-12 text-center text-sm text-slate-500">
              No papers in this pack yet.
            </Text>
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
              className="mb-2 flex-row items-center justify-between rounded-md border border-line bg-slate-50 px-3 py-3"
            >
              <View className="mr-2 min-w-0 flex-1">
                <Text className="text-sm font-semibold text-ink">
                  {item.title || `Paper ${item.paperNumber}`}
                </Text>
                <Text className="mt-0.5 text-xs text-slate-500">
                  Paper {item.paperNumber}
                  {item.reference ? ` · ${item.reference}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748B" />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
