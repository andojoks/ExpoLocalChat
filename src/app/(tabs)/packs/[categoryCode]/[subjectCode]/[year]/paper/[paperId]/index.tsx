import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  SUB_PAGE_BG,
  SubBanner,
  SubInkHeader,
} from '@/components/subscriptions/sub-chrome';
import { listPapers, listQuestionsForPaper } from '@/db/exam-bank';
import { buildPaperPeekDocumentBody } from '@/study/build-question-document';
import { QuestionHtmlView } from '@/study/question-html-view';
import { recordRecentStudy } from '@/study/recent-history';
import { listMyPacks } from '@/subscription/api';
import { cacheGetPacks, cacheSetPacks } from '@/subscription/cache';
import { recordStudyActivity } from '@/study/streak-api';

export default function PaperPeekScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
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

  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paperTitle, setPaperTitle] = useState('Questions');

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const papers = await listPapers(db, { subjectCode: subject });
      const paper = papers.find((p) => p.id === decodedPaperId);
      const title = paper?.title || `Paper ${paper?.paperNumber ?? ''}`.trim();
      if (paper) setPaperTitle(title);

      const page = await listQuestionsForPaper(db, {
        paperId: decodedPaperId,
        page: 1,
        pageSize: 100,
        rootOnly: true,
      });
      setTotal(page.total);
      setDocHtml(buildPaperPeekDocumentBody(page.items));

      const href = `/(tabs)/packs/${encodeURIComponent(cat)}/${encodeURIComponent(subject)}/${encodeURIComponent(yr)}/paper/${encodeURIComponent(decodedPaperId)}`;
      void recordRecentStudy({
        id: `paper:${decodedPaperId}`,
        paperId: decodedPaperId,
        kind: 'paper',
        title: title || 'Paper',
        subtitle: `${subject} · ${yr}`,
        href,
      });

      try {
        let packs = await cacheGetPacks();
        if (!packs?.length) {
          const mine = await listMyPacks();
          packs = mine.packs || [];
          await cacheSetPacks(packs);
        }
        const pack = packs.find((p) => p.category.code === cat);
        const course = pack?.courses.find((c) => c.code === subject);
        if (course?.id) {
          void recordStudyActivity({
            examCourseId: course.id,
            examPaperId: decodedPaperId,
          });
        }
      } catch {
        /* offline */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load questions');
      setDocHtml(null);
    } finally {
      setLoading(false);
    }
  }, [db, decodedPaperId, subject, cat, yr]);

  useEffect(() => {
    void load();
  }, [load]);

  function openQuestion(questionId: string) {
    router.push({
      pathname: '/(tabs)/packs/[categoryCode]/[subjectCode]/[year]/paper/[paperId]/study',
      params: {
        categoryCode: cat,
        subjectCode: subject,
        year: yr,
        paperId: decodedPaperId,
        questionId,
      },
    });
  }

  return (
    <View className="flex-1" style={{ backgroundColor: SUB_PAGE_BG }}>
      <SubInkHeader
        title={paperTitle}
        subtitle={`${total} question${total === 1 ? '' : 's'} · Tap to study`}
        onBack={() => router.back()}
      />

      {error ? (
        <SubBanner tone="error" icon="alert-circle-outline" body={error} />
      ) : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0548E8" />
        </View>
      ) : !docHtml || total === 0 ? (
        <View className="items-center px-6 py-16">
          <Text className="text-center text-[13px] text-slate-500">No questions on this paper.</Text>
        </View>
      ) : (
        <QuestionHtmlView
          html={docHtml}
          variant="full"
          fill
          interactive
          onMessageJson={(msg) => {
            if (msg.t === 'open' && msg.id) openQuestion(msg.id);
          }}
        />
      )}
    </View>
  );
}
