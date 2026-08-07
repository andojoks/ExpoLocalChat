import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getQuestionTree } from '@/db/exam-bank';
import type { ExamQuestionNode } from '@/domain/types';
import { StudyContent } from '@/study/study-content';

type OptionRow = {
  key: string;
  label: string;
  text?: string;
  html?: string;
};

function parseOptions(raw: unknown[] | undefined): OptionRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((opt, i) => {
    if (typeof opt === 'string') {
      return { key: `o${i}`, label: String.fromCharCode(65 + i), text: opt };
    }
    if (opt && typeof opt === 'object') {
      const o = opt as { text?: string; label?: string; renderedHtml?: string };
      return {
        key: `o${i}`,
        label: o.label || String.fromCharCode(65 + i),
        text: o.text,
        html: o.renderedHtml,
      };
    }
    return { key: `o${i}`, label: String.fromCharCode(65 + i), text: String(opt) };
  });
}

function QuestionBlock({
  node,
  depth = 0,
}: {
  node: ExamQuestionNode;
  depth?: number;
}) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const options = useMemo(() => parseOptions(node.options as unknown[] | undefined), [node.options]);
  const hasAnswer = Boolean(node.answerRenderedHtml?.trim() || node.answerMd?.trim());
  const hasSolution = Boolean(node.solutionRenderedHtml?.trim() || node.solutionMd?.trim());

  return (
    <View className={depth > 0 ? 'mt-4 border-l-2 border-mint pl-3' : ''}>
      <View className="mb-2 flex-row items-baseline justify-between gap-2">
        <Text className="text-base font-bold text-ink">
          {node.numberLabel || (depth === 0 ? 'Question' : 'Part')}
        </Text>
        {node.marks > 0 ? (
          <Text className="text-xs font-semibold text-slate-500">
            {node.marks} mark{node.marks === 1 ? '' : 's'}
          </Text>
        ) : null}
      </View>
      {node.topic ? <Text className="mb-2 text-xs text-forest">{node.topic}</Text> : null}

      <StudyContent html={node.promptRenderedHtml} markdown={node.promptMd} />

      {options.length > 0 ? (
        <View className="mt-3 gap-2">
          {options.map((opt) => (
            <View key={opt.key} className="rounded-md border border-line bg-slate-50 px-3 py-2">
              <Text className="mb-1 text-xs font-bold text-slate-500">{opt.label}</Text>
              <StudyContent html={opt.html} markdown={opt.text} />
            </View>
          ))}
        </View>
      ) : null}

      {hasAnswer ? (
        <View className="mt-3">
          <Pressable
            onPress={() => setShowAnswer((v) => !v)}
            className="self-start rounded-md border border-line px-3 py-1.5"
          >
            <Text className="text-xs font-semibold text-forest">
              {showAnswer ? 'Hide answer' : 'Show answer'}
            </Text>
          </Pressable>
          {showAnswer ? (
            <View className="mt-2 rounded-md border border-mint bg-mint px-3 py-2">
              <StudyContent html={node.answerRenderedHtml} markdown={node.answerMd} />
            </View>
          ) : null}
        </View>
      ) : null}

      {hasSolution ? (
        <View className="mt-3">
          <Pressable
            onPress={() => setShowSolution((v) => !v)}
            className="self-start rounded-md border border-line px-3 py-1.5"
          >
            <Text className="text-xs font-semibold text-forest">
              {showSolution ? 'Hide solution' : 'Show solution'}
            </Text>
          </Pressable>
          {showSolution ? (
            <View className="mt-2 rounded-md border border-line bg-paper px-3 py-2">
              <StudyContent html={node.solutionRenderedHtml} markdown={node.solutionMd} />
            </View>
          ) : null}
        </View>
      ) : null}

      {(node.children || []).map((child) => (
        <QuestionBlock key={child.id} node={child} depth={depth + 1} />
      ))}
    </View>
  );
}

export default function QuestionDetailScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const { questionId } = useLocalSearchParams<{ questionId: string }>();
  const id = Array.isArray(questionId) ? questionId[0] : questionId || '';

  const [node, setNode] = useState<ExamQuestionNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: node?.numberLabel ? `Q ${node.numberLabel}` : 'Question' });
  }, [navigation, node?.numberLabel]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const tree = await getQuestionTree(db, id);
      if (!tree) throw new Error('Question not found');
      setNode(tree);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load question');
      setNode(null);
    } finally {
      setLoading(false);
    }
  }, [db, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }

  if (error || !node) {
    return (
      <View className="flex-1 bg-white px-4 py-6">
        <Text className="text-sm text-red-700">{error || 'Question not found'}</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <QuestionBlock node={node} />
    </ScrollView>
  );
}
