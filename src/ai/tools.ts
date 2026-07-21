import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { SQLiteDatabase } from 'expo-sqlite';
import { cosine, type EmbeddingProvider } from '@/ai/embeddings/embedding';
import { getEmbedding, getQuestion, getQuestions, saveEmbedding } from '@/db/database';

const category = z.preprocess(
  (value) => (typeof value === 'string' ? (normalizeCategory(value) ?? value) : value),
  z.enum(['OL', 'AL']).optional(),
);
const numeric = z.preprocess((value) => {
  if (typeof value === 'string') {
    const match = value.match(/\d+/);
    return match ? Number(match[0]) : value;
  }
  return value;
}, z.number());
const filters = z.object({
  category,
  subject: z.preprocess(
    (value) => (value == null ? undefined : String(value)),
    z.string().optional(),
  ),
  topic: z.preprocess(
    (value) => (value == null ? undefined : String(value)),
    z.string().optional(),
  ),
  year: numeric.optional(),
  paper: numeric.pipe(z.number().min(1).max(3)).optional(),
  page: numeric.pipe(z.number().min(1)).default(1),
  pageSize: numeric.pipe(z.number().min(1).max(10)).default(5),
});

export function createQuestionTools(db: SQLiteDatabase, embeddings: EmbeddingProvider) {
  const listQuestions = tool(
    async (input) => {
      const all = await getQuestions(db),
        rows = all
          .filter((q) => matchesFilters(q, input))
          .sort((a, b) => num(a.number) - num(b.number)),
        start = (input.page - 1) * input.pageSize;
      return {
        items: rows.slice(start, start + input.pageSize),
        total: rows.length,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.max(1, Math.ceil(rows.length / input.pageSize)),
      };
    },
    {
      name: 'list_exam_questions',
      description:
        'List every matching exam question by level, subject, topic, year, and paper with UI pagination. Use this for all/list/show/browse requests and next or previous pages.',
      schema: filters,
    },
  );
  const retrieveQuestions = tool(
    async (input) => {
      const all = await getQuestions(db),
        query = safeText(input.query),
        queryVector = await embeddings.embedQuery(query || 'past exam question'),
        ranked = [] as { question: any; score: number }[];
      for (const q of all) {
        if (!matchesFilters(q, input)) continue;
        let vector = await getEmbedding(db, q.id);
        if (!vector) {
          vector = (
            await embeddings.embedDocuments([questionSearchText(q)], [questionSourceText(q)])
          )[0];
          await saveEmbedding(db, q.id, vector);
        }
        ranked.push({ question: q, score: cosine(queryVector, vector) });
      }
      ranked.sort((a, b) => b.score - a.score);
      const start = (input.page - 1) * input.pageSize;
      return {
        items: ranked
          .slice(start, start + input.pageSize)
          .map((x) => ({ ...x.question, score: Number(x.score.toFixed(3)) })),
        total: ranked.length,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.max(1, Math.ceil(ranked.length / input.pageSize)),
      };
    },
    {
      name: 'search_exam_questions',
      description:
        'Semantic RAG search for a concept, remembered wording, or misspelled text. Returns paginated database records.',
      schema: filters.extend({
        query: z.preprocess((value) => (value == null ? '' : String(value)), z.string()),
      }),
    },
  );
  const getQuestionDetails = tool(async ({ id }) => getQuestion(db, id), {
    name: 'get_question_details',
    description: 'Load one exact stored question with its answer, hints, and authored solution.',
    schema: z.object({ id: z.string() }),
  });
  const inspectCatalogue = tool(
    async (input) => {
      const all = await getQuestions(db),
        rows = all.filter((q) => matchesFilters(q, input));
      return {
        count: rows.length,
        subjects: unique(rows.map((q) => q.subject)),
        topics: unique(rows.map((q) => q.topic)),
        years: unique(rows.map((q) => q.year)).sort(),
        papers: unique(
          rows.map(
            (q) =>
              `${safeText(q.year)} ${safeText(q.category)} ${safeText(q.subject) || 'Unknown subject'} Paper ${safeText(q.paper) || '?'}`,
          ),
        ),
      };
    },
    {
      name: 'inspect_exam_catalogue',
      description: 'Check what subjects, topics, years, and papers exist in the local database.',
      schema: z.object({
        category,
        subject: z.preprocess(
          (value) => (value == null ? undefined : String(value)),
          z.string().optional(),
        ),
        year: numeric.optional(),
      }),
    },
  );
  return { listQuestions, retrieveQuestions, getQuestionDetails, inspectCatalogue };
}

function matchesFilters(q: any, input: any) {
  return (
    (!input.category || safeText(q.category) === input.category) &&
    (!input.subject || safeIncludes(q.subject, input.subject)) &&
    (!input.topic || safeIncludes(q.topic, input.topic)) &&
    (!input.year || num(q.year) === input.year) &&
    (!input.paper || num(q.paper) === input.paper)
  );
}
function questionSearchText(q: any) {
  return `${safeText(q.markdown)}\nTopic: ${safeText(q.topic)}\nSubject: ${safeText(q.subject)}\nTags: ${Array.isArray(q.tags) ? q.tags.map(safeText).join(', ') : ''}`.trim();
}
function questionSourceText(q: any) {
  return `${safeText(q.subject) || 'Unknown subject'} ${safeText(q.year)} Paper ${safeText(q.paper)}`.trim();
}
function safeIncludes(value: unknown, query: unknown) {
  const source = safeText(value).toLowerCase(),
    needle = safeText(query).toLowerCase();
  return !!needle && source.includes(needle);
}
function safeText(value: unknown) {
  return value == null ? '' : String(value);
}
function num(value: unknown) {
  return typeof value === 'number' ? value : Number(value);
}
function unique(values: unknown[]) {
  return [...new Set(values.map(safeText).filter(Boolean))];
}
function normalizeCategory(value: string) {
  const text = value.toLowerCase().replace(/[^a-z]/g, '');
  if (['ol', 'ordinary', 'ordinarylevel', 'olevel', 'gceordinarylevel'].includes(text)) return 'OL';
  if (['al', 'advanced', 'advancedlevel', 'alevel', 'gceadvancedlevel'].includes(text)) return 'AL';
  return undefined;
}
