import type { SQLiteDatabase } from 'expo-sqlite';
import { cosine, type EmbeddingProvider } from '@/ai/embeddings/embedding';
import { getEmbedding, getQuestion, getQuestions, saveEmbedding } from '@/db/database';

export type LocalTool = {
  name: string;
  description: string;
  invoke(input: Record<string, unknown>): Promise<any>;
};

type ResolvedFilters = {
  category?: 'OL' | 'AL';
  subject?: string;
  topic?: string;
  year?: number;
  paper?: number;
  page: number;
  pageSize: number;
  resolvedFilters: Record<string, unknown>;
};

export function createQuestionTools(db: SQLiteDatabase, embeddings: EmbeddingProvider) {
  const listQuestions: LocalTool = {
    name: 'list_exam_questions',
    description:
      'List exact stored exam questions by live SQLite filters. Accepts natural category, subject, topic, year, paper, page, and pageSize.',
    async invoke(input) {
      const all = await getQuestions(db);
      const filters = resolveFiltersFromCatalogue(all, input);
      const rows = all
        .filter((question) => matchesFilters(question, filters))
        .sort(
          (a, b) =>
            numberValue(a.year) - numberValue(b.year) ||
            numberValue(a.paper) - numberValue(b.paper) ||
            numberValue(a.number) - numberValue(b.number),
        );
      return paginate(rows, filters, filters.resolvedFilters);
    },
  };

  const retrieveQuestions: LocalTool = {
    name: 'search_exam_questions',
    description:
      'Semantic RAG search over stored question markdown, answers, explanations, topics, and tags. Use for fuzzy/misspelled/conceptual searches.',
    async invoke(input) {
      const all = await getQuestions(db);
      const filters = resolveFiltersFromCatalogue(all, input);
      const query = text(input.query) || catalogueQuery(input);
      const queryVector = await embeddings.embedQuery(
        query || 'Cameroon GCE past examination question',
      );
      const ranked: { question: any; score: number }[] = [];
      for (const question of all) {
        if (!matchesFilters(question, filters)) continue;
        let vector = await getEmbedding(db, question.id);
        if (!vector) {
          vector = (
            await embeddings.embedDocuments(
              [questionSearchText(question)],
              [questionSourceText(question)],
            )
          )[0];
          await saveEmbedding(db, question.id, vector);
        }
        ranked.push({ question, score: cosine(queryVector, vector) });
      }
      ranked.sort((a, b) => b.score - a.score);
      return paginate(
        ranked.map(({ question, score }) => ({ ...question, score: Number(score.toFixed(3)) })),
        filters,
        { ...filters.resolvedFilters, semanticQuery: query },
      );
    },
  };

  const getQuestionDetails: LocalTool = {
    name: 'get_question_details',
    description:
      'Load one exact stored question with answer markdown, hints, and authored explanation by id.',
    async invoke(input) {
      const question = await getQuestion(db, text(input.id));
      return question || { missing: true, id: text(input.id) };
    },
  };

  const inspectCatalogue: LocalTool = {
    name: 'inspect_exam_catalogue',
    description:
      'Inspect available categories, subjects, topics, years, and papers from SQLite. Use for availability and catalogue discovery.',
    async invoke(input) {
      const all = await getQuestions(db);
      const filters = resolveFiltersFromCatalogue(all, input);
      let rows = all.filter((question) => matchesFilters(question, filters));
      let broadened = false;
      if (!rows.length && all.length && hasActiveFilters(filters)) {
        rows = all;
        broadened = true;
      }
      return {
        count: rows.length,
        categories: unique(rows.map((q) => q.category)),
        subjects: unique(rows.map((q) => q.subject)),
        topics: unique(rows.map((q) => q.topic)),
        years: unique(rows.map((q) => q.year))
          .map(Number)
          .sort((a, b) => a - b),
        papers: unique(
          rows.map(
            (q) =>
              `${text(q.year)} ${text(q.category)} ${text(q.subject) || 'Unknown subject'} Paper ${
                text(q.paper) || '?'
              }`,
          ),
        ).slice(0, 40),
        resolvedFilters: filters.resolvedFilters,
        broadened,
        note: broadened
          ? 'No rows matched the requested filters; showing the full catalogue instead.'
          : undefined,
      };
    },
  };

  return { listQuestions, retrieveQuestions, getQuestionDetails, inspectCatalogue };
}

export type QuestionTools = ReturnType<typeof createQuestionTools>;
export type QuestionToolKey = keyof QuestionTools;

function resolveFiltersFromCatalogue(
  questions: any[],
  input: Record<string, unknown>,
): ResolvedFilters {
  const page = clampNumber(input.page, 1, 1, 9999);
  const pageSize = clampNumber(input.pageSize, 5, 1, 10);
  const category = resolveCategory(input.category, unique(questions.map((q) => q.category)));
  const subject = resolveCatalogueValue(input.subject, unique(questions.map((q) => q.subject)));
  const topic = resolveCatalogueValue(input.topic, unique(questions.map((q) => q.topic)));
  const year = resolveNumber(input.year);
  const paper = resolveNumber(input.paper);
  return {
    category: category.value as 'OL' | 'AL' | undefined,
    subject: subject.value,
    topic: topic.value,
    year,
    paper,
    page,
    pageSize,
    resolvedFilters: {
      category: category.changed ? category.value : undefined,
      subject: subject.changed ? subject.value : undefined,
      topic: topic.changed ? topic.value : undefined,
      year,
      paper,
    },
  };
}

function matchesFilters(question: any, filters: ResolvedFilters) {
  return (
    (!filters.category || text(question.category) === filters.category) &&
    (!filters.subject || sameText(question.subject, filters.subject)) &&
    (!filters.topic || sameText(question.topic, filters.topic)) &&
    (!filters.year || numberValue(question.year) === filters.year) &&
    (!filters.paper || numberValue(question.paper) === filters.paper)
  );
}

function hasActiveFilters(filters: ResolvedFilters) {
  return Boolean(filters.category || filters.subject || filters.topic || filters.year || filters.paper);
}

function paginate(
  items: any[],
  filters: ResolvedFilters,
  resolvedFilters: Record<string, unknown>,
) {
  const start = (filters.page - 1) * filters.pageSize;
  return {
    items: items.slice(start, start + filters.pageSize),
    total: items.length,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(1, Math.ceil(items.length / filters.pageSize)),
    resolvedFilters,
  };
}

function resolveCategory(raw: unknown, categories: string[]) {
  const literal = text(raw).trim().toUpperCase();
  if (!literal) return { value: undefined, changed: false };
  if (categories.includes(literal)) return { value: literal, changed: false };
  const normalized = normalize(raw).replace(/ /g, '');
  const ordinary = ['ol', 'olevel', 'ordinary', 'ordinarylevel', 'gceordinarylevel'];
  const advanced = ['al', 'alevel', 'advanced', 'advancedlevel', 'gceadvancedlevel'];
  const value = ordinary.includes(normalized)
    ? 'OL'
    : advanced.includes(normalized)
      ? 'AL'
      : undefined;
  return value && categories.includes(value)
    ? { value, changed: value !== raw }
    : { value: undefined, changed: false };
}

function resolveCatalogueValue(raw: unknown, candidates: string[]) {
  const query = normalize(raw);
  if (!query) return { value: undefined, changed: false };
  let best = '';
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = similarity(query, normalize(candidate));
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  // Never keep unresolved raw labels — they make every row fail matchesFilters.
  return bestScore >= 0.45
    ? { value: best, changed: text(raw) !== best }
    : { value: undefined, changed: Boolean(text(raw)) };
}

function resolveNumber(raw: unknown) {
  const value = numberValue(raw);
  return value || undefined;
}

function clampNumber(raw: unknown, fallback: number, min: number, max: number) {
  const value = numberValue(raw) || fallback;
  return Math.max(min, Math.min(max, value));
}

function questionSearchText(q: any) {
  return [
    q.markdown,
    q.answerMarkdown,
    q.explanationMarkdown,
    `Topic: ${text(q.topic)}`,
    `Subject: ${text(q.subject)}`,
    Array.isArray(q.tags) ? `Tags: ${q.tags.map(text).join(', ')}` : '',
  ]
    .map(text)
    .filter(Boolean)
    .join('\n');
}

function questionSourceText(q: any) {
  return `${text(q.subject) || 'Unknown subject'} ${text(q.year)} Paper ${text(q.paper)}`.trim();
}

function catalogueQuery(input: Record<string, unknown>) {
  return [input.subject, input.topic, input.year, input.paper, input.category]
    .map(text)
    .filter(Boolean)
    .join(' ');
}

function sameText(a: unknown, b: unknown) {
  return normalize(a) === normalize(b);
}

function similarity(query: string, candidate: string) {
  if (!query || !candidate) return 0;
  if (query === candidate) return 1;
  if (candidate.includes(query) || query.includes(candidate)) return 0.92;
  const qTokens = query.split(' ').filter(Boolean);
  const cTokens = candidate.split(' ').filter(Boolean);
  const tokenHits = qTokens.filter((q) =>
    cTokens.some(
      (c) =>
        c.includes(q) ||
        q.includes(c) ||
        levenshtein(q, c) <= Math.max(1, Math.floor(Math.max(q.length, c.length) * 0.25)),
    ),
  ).length;
  const tokenScore = qTokens.length ? tokenHits / qTokens.length : 0;
  const distanceScore =
    1 - levenshtein(query, candidate) / Math.max(query.length, candidate.length, 1);
  return Math.max(tokenScore * 0.82, distanceScore);
}

function normalize(value: unknown) {
  return text(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function text(value: unknown) {
  return value == null ? '' : String(value);
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const match = text(value).match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function unique(values: unknown[]) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function levenshtein(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}
