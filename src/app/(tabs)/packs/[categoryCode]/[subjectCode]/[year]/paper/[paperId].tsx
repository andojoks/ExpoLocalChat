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
import { listPapers, listQuestionsForPaper } from '@/db/exam-bank';
import type { QuestionListItem } from '@/domain/types';

export default function PaperQuestionsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const navigation = useNavigation();
  const { categoryCode, subjectCode, year, paperId } = useLocalSearchParams<{
    categoryCode: string;
    subjectCode: string;
    year: string;
    paperId: string;
  }>();
  const decodedPaperId = Array.isArray(paperId) ? paperId[0] : paperId || '';
  const subject = Array.isArray(subjectCode) ? subjectCode[0] : subjectCode || '';
  const cat = Array.isArray(categoryCode) ? categoryCode[0] : categoryCode || '';
  const yr = Array.isArray(year) ? year[0] : year || '';

  const [items, setItems] = useState<QuestionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paperTitle, setPaperTitle] = useState('Questions');

  useLayoutEffect(() => {
    navigation.setOptions({ title: paperTitle });
  }, [navigation, paperTitle]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const papers = await listPapers(db, { subjectCode: subject });
      const paper = papers.find((p) => p.id === decodedPaperId);
      if (paper) setPaperTitle(paper.title || `Paper ${paper.paperNumber}`);

      const page = await listQuestionsForPaper(db, {
        paperId: decodedPaperId,
        page: 1,
        pageSize: 100,
        rootOnly: true,
      });
      setItems(page.items);
      setTotal(page.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load questions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db, decodedPaperId, subject]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View className="flex-1 bg-white">
      <View className="border-b border-line px-4 py-3">
        <Text className="text-sm text-slate-500">{total} question{total === 1 ? '' : 's'}</Text>
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
          data={items}
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
            <Text className="py-12 text-center text-sm text-slate-500">No questions on this paper.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/packs/[categoryCode]/[subjectCode]/[year]/question/[questionId]',
                  params: {
                    categoryCode: cat,
                    subjectCode: subject,
                    year: yr,
                    questionId: item.id,
                  },
                })
              }
              className="mb-2 rounded-md border border-line bg-slate-50 px-3 py-3"
            >
              <View className="flex-row items-start justify-between gap-2">
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-ink">
                    {item.numberLabel || 'Q'}
                    {item.marks ? ` · ${item.marks} mark${item.marks === 1 ? '' : 's'}` : ''}
                  </Text>
                  {item.sectionName ? (
                    <Text className="mt-0.5 text-[11px] font-medium text-forest">{item.sectionName}</Text>
                  ) : null}
                  <Text numberOfLines={2} className="mt-1 text-xs leading-4 text-slate-600">
                    {item.stem || item.topic || 'Open question'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#64748B" style={{ marginTop: 2 }} />
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
