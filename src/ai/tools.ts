import type { SQLiteDatabase } from 'expo-sqlite';
import { z, type ZodType } from 'zod';
import { cosine, type EmbeddingProvider } from '@/ai/embeddings/embedding';
import {
  getQuestionTree,
  listCategories,
  listMessageEmbeddings,
  listPaperYears,
  listPapers,
  listQuestionsForPaper,
  listSectionsForPaper,
  listSubjects,
  keywordSearchExamBank,
  normalizeCategoryCode,
  reindexEntityEmbeddings,
  searchEntitiesByEmbedding,
} from '@/db/database';
import type { ExamEntityLevel } from '@/domain/types';
export { TOOL_NAMES, type QuestionToolName } from './tool-names';
import type { QuestionToolName } from './tool-names';

const pageFields = {
  page: z.union([z.number(), z.string()]).optional(),
  pageSize: z.union([z.number(), z.string()]).optional(),
};

const categorySchema = z.object({
  category: z.string().optional().describe('GCE_OL, GCE_AL, OL, or AL'),
});

const subjectSchema = z.object({
  category: z.string().optional(),
  categoryCode: z.string().optional(),
});

const paperSchema = z.object({
  category: z.string().optional(),
  subject: z.string().optional().describe('Subject name or code'),
  subjectCode: z.string().optional(),
  year: z.union([z.number(), z.string()]).optional(),
  paper: z.union([z.number(), z.string()]).optional(),
});

const sectionSchema = z.object({
  paperId: z.string().describe('Paper id from list_papers'),
});

const yearsSchema = z.object({
  category: z.string().optional(),
  subject: z.string().optional(),
  subjectCode: z.string().optional(),
});

const listQuestionsSchema = z.object({
  ...pageFields,
  paperId: z.string().optional(),
  sectionId: z.string().optional(),
  category: z.string().optional(),
  subject: z.string().optional(),
  subjectCode: z.string().optional(),
  topic: z.string().optional(),
  year: z.union([z.number(), z.string()]).optional(),
  paper: z.union([z.number(), z.string()]).optional(),
});

const detailsSchema = z.object({
  id: z.string().describe('Question id'),
});

const searchSchema = z.object({
  query: z.string().describe('Natural language search'),
  category: z.string().optional(),
  subject: z.string().optional(),
  subjectCode: z.string().optional(),
  year: z.union([z.number(), z.string()]).optional(),
  levels: z
    .array(z.enum(['category', 'subject', 'paper', 'section', 'question']))
    .optional(),
  topK: z.union([z.number(), z.string()]).optional(),
});

const memorySchema = z.object({
  query: z.string(),
  conversationId: z.string(),
  topK: z.union([z.number(), z.string()]).optional(),
});

export type ToolDef = {
  name: QuestionToolName;
  description: string;
  schema: ZodType;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
};

export type ToolRegistry = Record<QuestionToolName, ToolDef>;

const TOOL_CLIP = 1800;
let reindexed = false;

/** True for cheap in-process embedders that can reindex synchronously on first search. */
function isFastEmbedder(embeddings: EmbeddingProvider) {
  const name = (embeddings.name || '').toLowerCase();
  return name.includes('fallback') || name.includes('hash') || name.includes('mock');
}

async function ensureIndexed(db: SQLiteDatabase, embeddings: EmbeddingProvider) {
  let sample: { embedding_json: string | null } | null = null;
  try {
    sample = await db.getFirstAsync<{ embedding_json: string | null }>(
      'SELECT embedding_json FROM exam_questions WHERE embedding_json IS NOT NULL LIMIT 1',
    );
  } catch {
    // Stub DBs in unit tests may not implement getFirstAsync.
    reindexed = true;
    return;
  }
  if (sample?.embedding_json) {
    reindexed = true;
    return;
  }
  if (reindexed && !isFastEmbedder(embeddings)) return;

  if (isFastEmbedder(embeddings)) {
    reindexed = true;
    try {
      await reindexEntityEmbeddings(db, embeddings);
    } catch {
      reindexed = false;
    }
    return;
  }

  // Heavy on-device models: kick off in background so the turn is not blocked for minutes.
  if (reindexed) return;
  reindexed = true;
  void reindexEntityEmbeddings(db, embeddings).catch(() => {
    reindexed = false;
  });
}

/** Strip routing verbs so embeddings match the topic, not "search about …". */
export function cleanSearchQuery(raw: string): string {
  const trimmed = String(raw || '').trim();
  const cleaned = trimmed
    .replace(
      /^(find|search|look\s*up)\s+(about\s+|for\s+|similar\s+to\s+|related\s+to\s+)?/i,
      '',
    )
    .replace(/^about\s+/i, '')
    .trim();
  return cleaned || trimmed;
}

export function createQuestionTools(
  db: SQLiteDatabase,
  embeddings: EmbeddingProvider,
): ToolRegistry {
  const list_exam_categories: ToolDef = {
    name: 'list_exam_categories',
    description: 'List exam categories (GCE OL / GCE AL).',
    schema: categorySchema,
    async execute() {
      const items = await listCategories(db);
      return clipJson({
        count: items.length,
        items: items.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          description: clip(c.descriptionMd, 120),
        })),
      });
    },
  };

  const list_subjects: ToolDef = {
    name: 'list_subjects',
    description: 'List subjects under a category (code or OL/AL).',
    schema: subjectSchema,
    async execute(input) {
      const categoryCode = normalizeCategoryCode(
        String(input.categoryCode || input.category || ''),
      );
      const items = await listSubjects(db, { categoryCode });
      const allCats = await listCategories(db);
      const catById = new Map(allCats.map((c) => [c.id, c.code]));
      return clipJson({
        count: items.length,
        categoryCode: categoryCode || null,
        items: items.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          categoryCode: catById.get(s.categoryId) || null,
          description: clip(s.descriptionMd, 100),
        })),
      });
    },
  };

  const list_exam_years: ToolDef = {
    name: 'list_exam_years',
    description: 'List distinct paper years, optionally filtered by subject or category.',
    schema: yearsSchema,
    async execute(input) {
      const subjectName = input.subject ? String(input.subject) : undefined;
      const subjectCode = input.subjectCode ? String(input.subjectCode) : undefined;
      const categoryCode = normalizeCategoryCode(String(input.category || '')) || undefined;
      const years = await listPaperYears(db, {
        subjectName,
        subjectCode,
        categoryCode,
      });
      return clipJson({
        count: years.length,
        years,
        subject: subjectName || null,
        subjectCode: subjectCode || null,
        category: categoryCode || null,
      });
    },
  };

  const list_papers: ToolDef = {
    name: 'list_papers',
    description: 'List papers by subject / year / paper number.',
    schema: paperSchema,
    async execute(input) {
      const items = await listPapers(db, {
        categoryCode: String(input.category || ''),
        subjectName: input.subject ? String(input.subject) : undefined,
        subjectCode: input.subjectCode ? String(input.subjectCode) : undefined,
        year: num(input.year),
        paperNumber: num(input.paper),
      });
      return clipJson({
        count: items.length,
        items: items.slice(0, 20).map((p) => ({
          id: p.id,
          year: p.year,
          paperNumber: p.paperNumber,
          subject: p.subjectName,
          category: p.categoryCode,
          reference: p.reference,
          title: p.title,
        })),
      });
    },
  };

  const list_sections: ToolDef = {
    name: 'list_sections',
    description: 'List sections for a paper (empty if the paper has no sections).',
    schema: sectionSchema,
    async execute(input) {
      const items = await listSectionsForPaper(db, String(input.paperId));
      return clipJson({
        count: items.length,
        items: items.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          sortOrder: s.sortOrder,
          description: clip(s.descriptionMd, 80),
        })),
      });
    },
  };

  const list_exam_questions: ToolDef = {
    name: 'list_exam_questions',
    description: 'Paginated questions for filters or a paper/section.',
    schema: listQuestionsSchema,
    async execute(input) {
      const result = await listQuestionsForPaper(db, {
        paperId: input.paperId ? String(input.paperId) : undefined,
        sectionId: input.sectionId ? String(input.sectionId) : undefined,
        categoryCode: input.category ? String(input.category) : undefined,
        subjectName: input.subject ? String(input.subject) : undefined,
        subjectCode: input.subjectCode ? String(input.subjectCode) : undefined,
        topic: input.topic ? String(input.topic) : undefined,
        year: num(input.year),
        paperNumber: num(input.paper),
        page: num(input.page) || 1,
        pageSize: num(input.pageSize) || 5,
        rootOnly: true,
      });
      return clipJson(result);
    },
  };

  const get_question_details: ToolDef = {
    name: 'get_question_details',
    description: 'Load one question tree (prompt, answer, solution, nested parts).',
    schema: detailsSchema,
    async execute(input) {
      const tree = await getQuestionTree(db, String(input.id));
      if (!tree) return clipJson({ missing: true, id: input.id });
      return clipJson({
        id: tree.id,
        numberLabel: tree.numberLabel,
        topic: tree.topic,
        marks: tree.marks,
        durationMinutes: tree.durationMinutes,
        promptMd: clip(tree.promptMd, 700),
        answerMd: clip(tree.answerMd, 320),
        solutionMd: clip(tree.solutionMd, 900),
        hints: (tree.hints || []).slice(0, 3).map((h) => clip(h, 80)),
        children: (tree.children || []).map((child) => ({
          id: child.id,
          numberLabel: child.numberLabel,
          marks: child.marks,
          promptMd: clip(child.promptMd, 360),
          answerMd: clip(child.answerMd, 220),
          solutionMd: clip(child.solutionMd, 420),
        })),
      });
    },
  };

  const search_exam_bank: ToolDef = {
    name: 'search_exam_bank',
    description:
      'Semantic search across categories, subjects, papers, sections, and questions using embeddings.',
    schema: searchSchema,
    async execute(input) {
      await ensureIndexed(db, embeddings);
      const rawQuery = String(input.query || '').trim();
      const query = cleanSearchQuery(rawQuery);
      const queryVec = await embeddings.embedQuery(query || 'Cameroon GCE exam');
      let hits = await searchEntitiesByEmbedding({
        db,
        queryVec,
        levels: (input.levels as ExamEntityLevel[] | undefined) || undefined,
        filters: {
          categoryCode: input.category ? String(input.category) : undefined,
          subjectCode: input.subjectCode ? String(input.subjectCode) : undefined,
          subjectName: input.subject ? String(input.subject) : undefined,
          year: num(input.year),
        },
        topK: num(input.topK) || 8,
      });
      // If embeddings are still empty (heavy model indexing) or too strict, fall back to keywords.
      if (!hits.length) {
        hits = await keywordSearchExamBank(db, query, {
          categoryCode: input.category ? String(input.category) : undefined,
          subjectCode: input.subjectCode ? String(input.subjectCode) : undefined,
          subjectName: input.subject ? String(input.subject) : undefined,
          year: num(input.year),
        }, num(input.topK) || 8);
      }
      return clipJson({
        query,
        count: hits.length,
        hits: hits.map((hit) => ({
          level: hit.level,
          id: hit.id,
          score: Number(hit.score.toFixed(3)),
          label: hit.label,
          snippet: hit.snippet,
        })),
      });
    },
  };

  const search_conversation_memory: ToolDef = {
    name: 'search_conversation_memory',
    description: 'Recall prior chat turns by embedding similarity.',
    schema: memorySchema,
    async execute(input) {
      const topK = Math.min(5, Math.max(1, num(input.topK) || 3));
      const rows = await listMessageEmbeddings(db, String(input.conversationId));
      if (!rows.length) return { count: 0, hits: [] };
      const queryVec = await embeddings.embedQuery(String(input.query || ''));
      const ranked = rows
        .map((row) => ({
          role: row.role,
          text: row.text,
          score: cosine(queryVec, row.embedding),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
      return clipJson({
        count: ranked.length,
        hits: ranked.map((row) => ({
          role: row.role,
          text: clip(row.text, 120),
          score: Number(row.score.toFixed(3)),
        })),
      });
    },
  };

  return {
    list_exam_categories,
    list_subjects,
    list_exam_years,
    list_papers,
    list_sections,
    list_exam_questions,
    get_question_details,
    search_exam_bank,
    search_conversation_memory,
  };
}

export function clipObservation(value: unknown, max = 900) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : value;
}

function clipJson(value: unknown, max = TOOL_CLIP) {
  const text = JSON.stringify(value);
  if (text.length <= max) return value;
  return shrink(value, max);
}

function shrink(value: unknown, max: number): unknown {
  if (value && typeof value === 'object' && Array.isArray((value as any).items)) {
    const base = { ...(value as Record<string, unknown>) };
    let items = (base.items as Record<string, unknown>[]).map((item) => ({
      ...item,
      description: item.description ? clip(String(item.description), 40) : item.description,
      stem: item.stem ? clip(String(item.stem), 60) : item.stem,
      promptMd: undefined,
      answerMd: undefined,
      solutionMd: undefined,
    }));
    while (items.length > 1 && JSON.stringify({ ...base, items }).length > max) {
      items = items.slice(0, -1);
    }
    return { ...base, items, truncated: true };
  }
  if (value && typeof value === 'object' && Array.isArray((value as any).hits)) {
    const base = { ...(value as Record<string, unknown>) };
    let hits = (base.hits as Record<string, unknown>[]).map((hit) => ({
      ...hit,
      snippet: hit.snippet ? clip(String(hit.snippet), 60) : hit.snippet,
    }));
    while (hits.length > 1 && JSON.stringify({ ...base, hits }).length > max) {
      hits = hits.slice(0, -1);
    }
    return { ...base, hits, truncated: true };
  }
  const text = JSON.stringify(value);
  if (text.length <= max) return value;
  return { truncated: true, preview: `${text.slice(0, max - 20)}…` };
}

function clip(value: string, max: number) {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function num(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const match = value == null ? undefined : String(value).match(/\d+/);
  return match ? Number(match[0]) : undefined;
}


