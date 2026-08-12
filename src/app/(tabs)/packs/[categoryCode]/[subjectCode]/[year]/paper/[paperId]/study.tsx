import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  SubBanner,
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
import { LABEL_TEXT_ANDROID } from '@/components/ui/app-text';

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

export default function PaperStudyScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const confirm = useConfirmDialog();
  const pillScrollRef = useRef<ScrollView>(null);
  const { categoryCode, subjectCode, year, paperId, questionId } = useLocalSearchParams<{
    categoryCode: string;
    subjectCode: string;
    year: string;
    paperId: string;
    questionId?: string;
  }>();

  const decodedPaperId = Array.isArray(paperId) ? paperId[0] : paperId || '';
  const subject = Array.isArray(subjectCode) ? subjectCode[0] : subjectCode || '';
  const cat = Array.isArray(categoryCode) ? categoryCode[0] : categoryCode || '';
  const yr = Array.isArray(year) ? year[0] : year || '';
  const startQuestionId = Array.isArray(questionId) ? questionId[0] : questionId || '';

  const [items, setItems] = useState<QuestionListItem[]>([]);
  const [index, setIndex] = useState(0);
  const [node, setNode] = useState<ExamQuestionNode | null>(null);
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [paperTitle, setPaperTitle] = useState('Paper');
  const [learnerPack, setLearnerPack] = useState<LearnerPackSummary | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const docCache = useRef(new Map<string, string>());

  const canReveal = useMemo(
    () => hasActiveAccess(learnerPack, subject),
    [learnerPack, subject],
  );

  const current = items[index] || null;
  const topics = useMemo(() => (node ? collectTopics(node) : []), [node]);
  const prev = index > 0 ? items[index - 1] : null;
  const next = index < items.length - 1 ? items[index + 1] : null;

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
      /* offline */
    }
  }, [cat, subject]);

  const boot = useCallback(async () => {
    setError(null);
    setBootLoading(true);
    try {
      const papers = await listPapers(db, { subjectCode: subject });
      const paper = papers.find((p) => p.id === decodedPaperId);
      const title = paper?.title || `Paper ${paper?.paperNumber ?? ''}`.trim() || 'Paper';
      if (paper) setPaperTitle(title);

      const page = await listQuestionsForPaper(db, {
        paperId: decodedPaperId,
        page: 1,
        pageSize: 100,
        rootOnly: true,
      });
      setItems(page.items);
      docCache.current.clear();

      let start = 0;
      if (startQuestionId) {
        const found = page.items.findIndex((q) => q.id === startQuestionId);
        if (found >= 0) start = found;
      }
      setIndex(start);

      const href = `/(tabs)/packs/${encodeURIComponent(cat)}/${encodeURIComponent(subject)}/${encodeURIComponent(yr)}/paper/${encodeURIComponent(decodedPaperId)}/study`;
      void recordRecentStudy({
        id: `paper:${decodedPaperId}`,
        paperId: decodedPaperId,
        kind: 'paper',
        title,
        subtitle: `${subject} · ${yr}`,
        href,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load paper');
      setItems([]);
    } finally {
      setBootLoading(false);
    }
  }, [db, decodedPaperId, subject, startQuestionId, cat, yr]);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);

  useEffect(() => {
    const courseId = learnerPack?.courses.find((c) => c.code === subject)?.id;
    if (!courseId || !decodedPaperId) return;
    void recordStudyActivity({
      examCourseId: courseId,
      examPaperId: decodedPaperId,
    });
  }, [learnerPack, subject, decodedPaperId]);

  // Invalidate reveal-sensitive cache when entitlement changes
  useEffect(() => {
    docCache.current.clear();
  }, [canReveal]);

  useEffect(() => {
    const item = items[index];
    if (!item) {
      setNode(null);
      setDocHtml(null);
      return;
    }

    let cancelled = false;
    const cacheKey = `${item.id}:${canReveal ? '1' : '0'}`;
    const cached = docCache.current.get(cacheKey);

    setContentLoading(true);
    setError(null);
    setDocHtml(null);
    setNode(null);

    void (async () => {
      try {
        const tree = await getQuestionTree(db, item.id);
        if (cancelled) return;
        if (!tree) throw new Error('Question not found');
        setNode(tree);

        if (cached) {
          setDocHtml(cached);
          return;
        }
        const html = await buildQuestionDocumentAsync(tree, {
          mode: 'detail',
          canReveal,
        });
        if (cancelled) return;
        docCache.current.set(cacheKey, html);
        setDocHtml(html);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load question');
          setNode(null);
          setDocHtml(null);
        }
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [db, items, index, canReveal]);

  // Keep active pill visible
  useEffect(() => {
    if (items.length === 0) return;
    const approxPill = 44;
    pillScrollRef.current?.scrollTo({
      x: Math.max(0, index * approxPill - 80),
      animated: true,
    });
  }, [index, items.length]);

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

  function goToIndex(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= items.length || nextIndex === index) return;
    setIndex(nextIndex);
  }

  const goPrev = useCallback(() => {
    if (index > 0) setIndex(index - 1);
  }, [index]);

  const goNext = useCallback(() => {
    if (index < items.length - 1) setIndex(index + 1);
  }, [index, items.length]);

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

  const title = current?.numberLabel
    ? `Q ${current.numberLabel}`
    : paperTitle;
  const subtitle =
    items.length > 0
      ? `${index + 1} of ${items.length}${paperTitle ? ` · ${paperTitle}` : ''}`
      : paperTitle;
  const marksLabel =
    node && node.marks > 0
      ? `${node.marks} mark${node.marks === 1 ? '' : 's'}`
      : current?.marks
        ? `${current.marks} mk`
        : null;

  return (
    <View className="flex-1 bg-white">
      <SubInkHeader
        title={title}
        subtitle={subtitle}
        onBack={() => router.back()}
        right={
          marksLabel ? (
            <Text className="pr-1 text-sm font-bold text-[#93C5FD]">{marksLabel}</Text>
          ) : null
        }
        footer={
          items.length > 0 ? (
            <ScrollView
              ref={pillScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 4,
                paddingTop: 2,
                paddingBottom: 14,
                gap: 8,
                alignItems: 'center',
              }}
            >
              {items.map((q, i) => {
                const active = i === index;
                const label = q.numberLabel || String(i + 1);
                return (
                  <Pressable
                    key={q.id}
                    onPress={() => goToIndex(i)}
                    className="min-w-[36px] items-center justify-center rounded-2xl px-2.5 py-1.5"
                    style={{
                      backgroundColor: active ? '#0548E8' : 'rgba(255,255,255,0.08)',
                      borderWidth: 1,
                      borderColor: active ? '#0548E8' : 'rgba(148,163,184,0.28)',
                    }}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        active ? 'text-white' : 'text-[#94A3B8]'
                      }`}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null
        }
      />

      {error && !bootLoading ? (
        <SubBanner tone="error" icon="alert-circle-outline" body={error} />
      ) : null}

      {bootLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0548E8" />
        </View>
      ) : items.length === 0 ? (
        <View className="items-center px-6 py-16">
          <Text className="text-center text-[13px] text-slate-500">No questions on this paper.</Text>
        </View>
      ) : (
        <>
          <StudySwipeArea
            enabled={items.length > 1}
            onSwipeLeft={goNext}
            onSwipeRight={goPrev}
          >
            <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
              <View className="flex-1 bg-white">
                {topics.length > 0 ? (
                  <View className="flex-row flex-wrap gap-2 border-b border-[#E8EEF4] px-3 py-2.5">
                    {topics.map((topic) => (
                      <View
                        key={topic}
                        className="rounded-full px-3 py-1.5"
                        style={{
                          backgroundColor: '#EFF6FF',
                          borderWidth: 1,
                          borderColor: '#BFDBFE',
                        }}
                      >
                        <Text className="text-xs font-semibold text-[#0439C4]">{topic}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {!canReveal ? (
                  <Pressable
                    onPress={onLockedPress}
                    className="flex-row items-center gap-2 border-b border-[#FDE68A] px-3.5 py-3"
                    style={{ backgroundColor: '#FFFBEB' }}
                  >
                    <Ionicons name="lock-closed" size={14} color="#B45309" />
                    <Text className="flex-1 text-xs font-semibold text-[#92400E]">
                      Subscribe to reveal answers and correct options
                    </Text>
                  </Pressable>
                ) : null}

                <View className="bg-white">
                  {contentLoading && !docHtml ? (
                    <View className="items-center py-10">
                      <ActivityIndicator color="#0548E8" />
                    </View>
                  ) : docHtml ? (
                    <QuestionHtmlView
                      key={current?.id}
                      html={docHtml}
                      variant="full"
                      interactive
                      minHeight={120}
                      onMessageJson={onStudyMessage}
                    />
                  ) : (
                    <View className="items-center py-10">
                      <Text className="text-sm text-slate-500">Unable to load this question.</Text>
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>
          </StudySwipeArea>

          {items.length > 1 ? (
            <SubFooterBar>
              <View className="flex-row items-center gap-3">
                <Pressable
                  disabled={!prev}
                  onPress={() => goToIndex(index - 1)}
                  className="h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl"
                  style={{ backgroundColor: prev ? '#0548E8' : '#E2E8F0' }}
                >
                  <Ionicons
                    name="chevron-back"
                    size={18}
                    color={prev ? '#FFFFFF' : '#94A3B8'}
                  />
                  <Text
                    className={`text-sm font-bold ${prev ? 'text-white' : 'text-slate-400'}`}
                    numberOfLines={1}
                    style={LABEL_TEXT_ANDROID}
                  >
                    Previous
                  </Text>
                </Pressable>
                <Pressable
                  disabled={!next}
                  onPress={() => goToIndex(index + 1)}
                  className="h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl"
                  style={{ backgroundColor: next ? '#0548E8' : '#E2E8F0' }}
                >
                  <Text
                    className={`text-sm font-bold ${next ? 'text-white' : 'text-slate-400'}`}
                    numberOfLines={1}
                    style={LABEL_TEXT_ANDROID}
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
