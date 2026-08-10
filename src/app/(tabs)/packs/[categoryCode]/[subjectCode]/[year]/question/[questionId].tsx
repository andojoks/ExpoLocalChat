import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  SUB_PAGE_BG,
  SubCard,
  SubFooterBar,
  SubInkHeader,
} from '@/components/subscriptions/sub-chrome';
import { getQuestionTree, listPapers, listQuestionsForPaper } from '@/db/exam-bank';
import type { ExamQuestionNode, QuestionListItem } from '@/domain/types';
import { buildQuestionDocumentAsync } from '@/study/build-question-document';
import { QuestionHtmlView } from '@/study/question-html-view';
import { StudySwipeArea } from '@/study/study-swipe-area';
import { listMyPacks, type LearnerPackSummary } from '@/subscription/api';
import { cacheGetPacks, cacheSetPacks } from '@/subscription/cache';
import { recordRecentStudy } from '@/study/recent-history';
import { recordStudyActivity } from '@/study/streak-api';

function findLearnerPack(
  packs: LearnerPackSummary[],
  categoryCode: string,
  subjectCode: string,
) {
  const byCategory = packs.filter((p) => p.category.code === categoryCode);
  if (byCategory.length === 0) return null;
  const withCourse = byCategory.find((p) =>
    p.courses.some((c) => c.code === subjectCode),
  );
  return withCourse || byCategory[0];
}

function hasActiveAccess(
  pack: LearnerPackSummary | null,
  subjectCode: string,
): boolean {
  if (!pack?.activeSubscription) return false;
  return pack.courses.some((c) => c.code === subjectCode);
}

function collectTopics(node: ExamQuestionNode): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  function walk(n: ExamQuestionNode) {
    const raw = n.topic?.trim();
    if (raw) {
      for (const part of raw.split(/[,;|/]/)) {
        const t = part.trim();
        if (!t) continue;
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(t);
      }
    }
    for (const child of n.children || []) walk(child);
  }
  walk(node);
  return out;
}

export default function QuestionDetailScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const confirm = useConfirmDialog();
  const { categoryCode, subjectCode, year, paperId, questionId } = useLocalSearchParams<{
    categoryCode: string;
    subjectCode: string;
    year: string;
    paperId?: string;
    questionId: string;
  }>();

  const id = Array.isArray(questionId) ? questionId[0] : questionId || '';
  const decodedPaperId = Array.isArray(paperId) ? paperId[0] : paperId || '';
  const cat = Array.isArray(categoryCode) ? categoryCode[0] : categoryCode || '';
  const subject = Array.isArray(subjectCode) ? subjectCode[0] : subjectCode || '';
  const yr = Array.isArray(year) ? year[0] : year || '';

  const [node, setNode] = useState<ExamQuestionNode | null>(null);
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [siblings, setSiblings] = useState<QuestionListItem[]>([]);
  const [learnerPack, setLearnerPack] = useState<LearnerPackSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canReveal = useMemo(
    () => hasActiveAccess(learnerPack, subject),
    [learnerPack, subject],
  );

  const topics = useMemo(() => (node ? collectTopics(node) : []), [node]);

  const index = useMemo(
    () => siblings.findIndex((q) => q.id === id),
    [siblings, id],
  );
  const prev = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;

  const loadAccess = useCallback(async () => {
    const cached = await cacheGetPacks();
    if (cached?.length) {
      setLearnerPack(findLearnerPack(cached, cat, subject));
      return;
    }
    try {
      const mine = await listMyPacks();
      const packs = mine.packs || [];
      await cacheSetPacks(packs);
      setLearnerPack(findLearnerPack(packs, cat, subject));
    } catch {
      // Keep cached access state when offline.
    }
  }, [cat, subject]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    setDocHtml(null);
    try {
      const tree = await getQuestionTree(db, id);
      if (!tree) throw new Error('Question not found');
      setNode(tree);

      if (decodedPaperId) {
        const page = await listQuestionsForPaper(db, {
          paperId: decodedPaperId,
          page: 1,
          pageSize: 100,
          rootOnly: true,
        });
        setSiblings(page.items);
      } else {
        setSiblings([]);
      }

      const qLabel = tree.numberLabel || id.slice(0, 8);
      // Prefer paper-level recent entry so the same paper isn't listed multiple times.
      if (decodedPaperId) {
        const papers = await listPapers(db, { subjectCode: subject });
        const paper = papers.find((p) => p.id === decodedPaperId);
        const paperTitle =
          paper?.title ||
          `Paper ${paper?.paperNumber ?? ''}`.trim() ||
          `Paper · Q ${qLabel}`;
        const href = `/(tabs)/packs/${encodeURIComponent(cat)}/${encodeURIComponent(subject)}/${encodeURIComponent(yr)}/paper/${encodeURIComponent(decodedPaperId)}/study`;
        void recordRecentStudy({
          id: `paper:${decodedPaperId}`,
          paperId: decodedPaperId,
          kind: 'paper',
          title: paperTitle,
          subtitle: `${subject} · ${yr}`,
          href,
        });
      } else {
        const href = `/(tabs)/packs/${encodeURIComponent(cat)}/${encodeURIComponent(subject)}/${encodeURIComponent(yr)}/question/${encodeURIComponent(id)}`;
        void recordRecentStudy({
          id: `question:${id}`,
          kind: 'question',
          title: `Question ${qLabel}`,
          subtitle: `${subject} · ${yr}`,
          href,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load question');
      setNode(null);
    } finally {
      setLoading(false);
    }
  }, [db, id, decodedPaperId, cat, subject, yr]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);

  useEffect(() => {
    const courseId = learnerPack?.courses.find((c) => c.code === subject)?.id;
    if (!courseId) return;
    void recordStudyActivity({
      examCourseId: courseId,
      examPaperId: decodedPaperId || undefined,
    });
  }, [learnerPack, subject, decodedPaperId]);

  useEffect(() => {
    if (!node) {
      setDocHtml(null);
      return;
    }
    let cancelled = false;
    void buildQuestionDocumentAsync(node, {
      mode: 'detail',
      canReveal,
    })
      .then((html) => {
        if (!cancelled) setDocHtml(html);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to compose question');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [node, canReveal]);

  function goToSubscribe() {
    if (learnerPack) {
      router.push({
        pathname: '/(tabs)/account/subscriptions/[packId]',
        params: { packId: learnerPack.id, tab: 'subscription' },
      } as never);
      return;
    }
    router.push('/(tabs)/account/subscriptions/build' as never);
  }

  function onLockedPress() {
    confirm.ask(
      {
        title: 'Subscription required',
        message: 'Subscribe to this pack to view answers and solutions.',
        confirmLabel: 'Subscribe',
        cancelLabel: 'Not now',
        icon: 'lock-closed-outline',
      },
      goToSubscribe,
    );
  }

  function goTo(targetId: string) {
    router.replace({
      pathname: '/(tabs)/packs/[categoryCode]/[subjectCode]/[year]/question/[questionId]',
      params: {
        categoryCode: cat,
        subjectCode: subject,
        year: yr,
        paperId: decodedPaperId,
        questionId: targetId,
      },
    });
  }

  const goPrev = useCallback(() => {
    if (!prev) return;
    router.replace({
      pathname: '/(tabs)/packs/[categoryCode]/[subjectCode]/[year]/question/[questionId]',
      params: {
        categoryCode: cat,
        subjectCode: subject,
        year: yr,
        paperId: decodedPaperId,
        questionId: prev.id,
      },
    });
  }, [prev, router, cat, subject, yr, decodedPaperId]);

  const goNext = useCallback(() => {
    if (!next) return;
    router.replace({
      pathname: '/(tabs)/packs/[categoryCode]/[subjectCode]/[year]/question/[questionId]',
      params: {
        categoryCode: cat,
        subjectCode: subject,
        year: yr,
        paperId: decodedPaperId,
        questionId: next.id,
      },
    });
  }, [next, router, cat, subject, yr, decodedPaperId]);

  const onStudyMessage = useCallback(
    (msg: { t?: string; dir?: string }) => {
      if (msg.t === 'locked') {
        onLockedPress();
        return;
      }
      if (msg.t === 'swipe') {
        if (msg.dir === 'left') goNext();
        else if (msg.dir === 'right') goPrev();
      }
    },
    [goNext, goPrev],
  );

  const title = node?.numberLabel ? `Q ${node.numberLabel}` : 'Question';
  const subtitle =
    siblings.length > 0 && index >= 0
      ? `${index + 1} of ${siblings.length}`
      : undefined;
  const marksLabel =
    node && node.marks > 0
      ? `${node.marks} mark${node.marks === 1 ? '' : 's'}`
      : null;

  return (
    <View className="flex-1" style={{ backgroundColor: SUB_PAGE_BG }}>
      <SubInkHeader
        title={title}
        subtitle={subtitle}
        onBack={() => router.back()}
        right={
          marksLabel ? (
            <Text className="pr-1 text-sm font-bold text-[#93C5FD]">{marksLabel}</Text>
          ) : null
        }
      />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2563EB" />
        </View>
      ) : error || !node ? (
        <View className="px-5 py-6">
          <Text className="text-sm text-[#B91C1C]">{error || 'Question not found'}</Text>
        </View>
      ) : (
        <>
          <StudySwipeArea
            enabled={siblings.length > 1}
            onSwipeLeft={goNext}
            onSwipeRight={goPrev}
          >
            <ScrollView
              className="flex-1"
              contentContainerStyle={{
                padding: 20,
                paddingBottom: 24,
              }}
            >
              <View className="gap-3">
                {topics.length > 0 ? (
                  <View className="flex-row flex-wrap gap-2">
                    {topics.map((topic) => (
                      <View
                        key={topic}
                        className="rounded-full px-3 py-1.5"
                        style={{
                          backgroundColor: '#FFFFFF',
                          borderWidth: 1,
                          borderColor: '#BFDBFE',
                        }}
                      >
                        <Text className="text-xs font-semibold text-[#1D4ED8]">{topic}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {!canReveal ? (
                  <Pressable
                    onPress={onLockedPress}
                    className="flex-row items-center gap-2 rounded-2xl px-3.5 py-3"
                    style={{
                      borderWidth: 1,
                      borderColor: '#FDE68A',
                      backgroundColor: '#FFFBEB',
                    }}
                  >
                    <Ionicons name="lock-closed" size={14} color="#B45309" />
                    <Text className="flex-1 text-xs font-semibold text-[#92400E]">
                      Subscribe to reveal answers and correct options
                    </Text>
                  </Pressable>
                ) : null}

                <SubCard>
                  {docHtml ? (
                    <QuestionHtmlView
                      html={docHtml}
                      variant="full"
                      interactive
                      minHeight={120}
                      onMessageJson={onStudyMessage}
                    />
                  ) : (
                    <View className="items-center py-10">
                      <ActivityIndicator color="#2563EB" />
                    </View>
                  )}
                </SubCard>
              </View>
            </ScrollView>
          </StudySwipeArea>

          {siblings.length > 1 ? (
            <SubFooterBar>
              <View className="flex-row items-center gap-3">
                <Pressable
                  disabled={!prev}
                  onPress={() => prev && goTo(prev.id)}
                  className="h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl"
                  style={{ backgroundColor: prev ? '#0B1424' : '#E2E8F0' }}
                >
                  <Ionicons
                    name="chevron-back"
                    size={18}
                    color={prev ? '#FFFFFF' : '#94A3B8'}
                  />
                  <Text
                    className={`text-sm font-bold ${prev ? 'text-white' : 'text-slate-400'}`}
                  >
                    Previous
                  </Text>
                </Pressable>
                <Pressable
                  disabled={!next}
                  onPress={() => next && goTo(next.id)}
                  className="h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl"
                  style={{ backgroundColor: next ? '#0B1424' : '#E2E8F0' }}
                >
                  <Text
                    className={`text-sm font-bold ${next ? 'text-white' : 'text-slate-400'}`}
                  >
                    Next
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={next ? '#FFFFFF' : '#94A3B8'}
                  />
                </Pressable>
              </View>
            </SubFooterBar>
          ) : null}
        </>
      )}
      {confirm.dialog}
    </View>
  );
}
