import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';
import { cosine, type EmbeddingProvider } from '@/ai/embeddings/embedding';
import type {
  ExamCategory,
  ExamCategoryCode,
  ExamEntityLevel,
  ExamPaper,
  ExamQuestion,
  ExamQuestionNode,
  ExamSearchHit,
  ExamSection,
  ExamSubject,
  QuestionListItem,
} from '@/domain/types';

export async function ensureExamBankV2(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS exam_categories(
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description_md TEXT,
      embedding_json TEXT,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS subjects(
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      description_md TEXT,
      embedding_json TEXT,
      updated_at INTEGER,
      UNIQUE(category_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_subjects_category ON subjects(category_id);
    CREATE TABLE IF NOT EXISTS exam_papers(
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      paper_number INTEGER NOT NULL,
      title TEXT,
      reference TEXT,
      duration_minutes INTEGER,
      description_md TEXT,
      embedding_json TEXT,
      updated_at INTEGER,
      UNIQUE(subject_id, year, paper_number)
    );
    CREATE INDEX IF NOT EXISTS idx_exam_papers_subject_year ON exam_papers(subject_id, year);
    CREATE TABLE IF NOT EXISTS exam_sections(
      id TEXT PRIMARY KEY,
      subject_id TEXT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      description_md TEXT,
      embedding_json TEXT,
      updated_at INTEGER,
      UNIQUE(subject_id, code)
    );
    CREATE TABLE IF NOT EXISTS exam_questions(
      id TEXT PRIMARY KEY,
      parent_question_id TEXT,
      number_label TEXT,
      topic TEXT,
      marks INTEGER,
      duration_minutes INTEGER,
      prompt_md TEXT NOT NULL,
      answer_md TEXT,
      solution_md TEXT,
      prompt_rendered_html TEXT,
      answer_rendered_html TEXT,
      solution_rendered_html TEXT,
      options_json TEXT,
      hints_json TEXT,
      tags_json TEXT,
      embedding_json TEXT,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_exam_questions_parent ON exam_questions(parent_question_id);
    CREATE TABLE IF NOT EXISTS paper_sections(
      paper_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(paper_id, section_id)
    );
    CREATE TABLE IF NOT EXISTS paper_questions(
      paper_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      section_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(paper_id, question_id)
    );
    CREATE INDEX IF NOT EXISTS idx_paper_questions_paper ON paper_questions(paper_id);
    CREATE INDEX IF NOT EXISTS idx_paper_questions_section ON paper_questions(section_id);
    CREATE TABLE IF NOT EXISTS installed_packs(
      category_code TEXT NOT NULL,
      subject_code TEXT NOT NULL,
      year INTEGER NOT NULL,
      version TEXT NOT NULL,
      checksum TEXT NOT NULL,
      installed_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'installed',
      PRIMARY KEY(category_code, subject_code, year)
    );
  `);

  // Migrate older installs that lack rendered-HTML columns
  for (const col of [
    'prompt_rendered_html TEXT',
    'answer_rendered_html TEXT',
    'solution_rendered_html TEXT',
    'options_json TEXT',
  ]) {
    try {
      await db.execAsync(`ALTER TABLE exam_questions ADD COLUMN ${col};`);
    } catch {
      /* already exists */
    }
  }

  // Drop hardcoded seed bank if present — exam content comes only from installed packs.
  await purgeLegacySeedBank(db);
}

async function purgeLegacySeedBank(db: SQLiteDatabase) {
  const seeded = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_state WHERE key=?',
    'seed_version',
  );
  if (!seeded) return;

  await db.execAsync(`
    DELETE FROM paper_questions;
    DELETE FROM paper_sections;
    DELETE FROM exam_questions;
    DELETE FROM exam_sections;
    DELETE FROM exam_papers;
    DELETE FROM subjects;
    DELETE FROM exam_categories;
    DELETE FROM installed_packs;
    DELETE FROM sync_state WHERE key='seed_version';
  `);
}

export function normalizeCategoryCode(
  value?: string | null,
): ExamCategoryCode | undefined {
  if (!value) return undefined;
  const raw = String(value).trim().toUpperCase().replace(/\s+/g, '_');
  if (raw === 'GCE_OL' || raw === 'OL' || raw === 'O_LEVEL' || raw === 'ORDINARY') return 'GCE_OL';
  if (raw === 'GCE_AL' || raw === 'AL' || raw === 'A_LEVEL' || raw === 'ADVANCED') return 'GCE_AL';
  return undefined;
}

export async function listCategories(db: SQLiteDatabase): Promise<ExamCategory[]> {
  const rows = await db.getAllAsync<any>(
    'SELECT id,code,name,description_md FROM exam_categories ORDER BY code',
  );
  return rows.map(mapCategory);
}

export async function listPaperYears(
  db: SQLiteDatabase,
  filter: {
    subjectCode?: string;
    subjectName?: string;
    categoryCode?: string;
  } = {},
): Promise<number[]> {
  const clauses: string[] = [];
  const args: SQLiteBindValue[] = [];
  if (filter.subjectCode) {
    clauses.push('s.code=?');
    args.push(filter.subjectCode.toUpperCase());
  }
  if (filter.subjectName) {
    clauses.push('LOWER(s.name) LIKE ?');
    args.push(`%${String(filter.subjectName).toLowerCase()}%`);
  }
  const cat = normalizeCategoryCode(filter.categoryCode) || filter.categoryCode;
  if (cat) {
    clauses.push('c.code=?');
    args.push(String(cat).toUpperCase());
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db.getAllAsync<{ year: number }>(
    `SELECT DISTINCT p.year as year
     FROM exam_papers p
     JOIN subjects s ON s.id=p.subject_id
     JOIN exam_categories c ON c.id=s.category_id
     ${where}
     ORDER BY p.year`,
    ...args,
  );
  return rows.map((r) => Number(r.year)).filter((y) => Number.isFinite(y));
}

export async function listTopics(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ topic: string }>(
    `SELECT DISTINCT topic FROM exam_questions
     WHERE topic IS NOT NULL AND TRIM(topic) != ''
     ORDER BY topic`,
  );
  return rows.map((r) => String(r.topic || '').trim()).filter(Boolean);
}

export async function listSubjects(
  db: SQLiteDatabase,
  filter: { categoryId?: string; categoryCode?: string } = {},
): Promise<ExamSubject[]> {
  const code = normalizeCategoryCode(filter.categoryCode);
  let rows: any[];
  if (filter.categoryId) {
    rows = await db.getAllAsync(
      'SELECT * FROM subjects WHERE category_id=? ORDER BY name',
      filter.categoryId,
    );
  } else if (code) {
    rows = await db.getAllAsync(
      `SELECT s.* FROM subjects s
       JOIN exam_categories c ON c.id=s.category_id
       WHERE c.code=? ORDER BY s.name`,
      code,
    );
  } else {
    rows = await db.getAllAsync('SELECT * FROM subjects ORDER BY name');
  }
  return rows.map(mapSubject);
}

export async function listPapers(
  db: SQLiteDatabase,
  filter: {
    subjectId?: string;
    subjectCode?: string;
    subjectName?: string;
    categoryCode?: string;
    year?: number;
    paperNumber?: number;
  } = {},
): Promise<(ExamPaper & { subjectName?: string; categoryCode?: string })[]> {
  const clauses: string[] = [];
  const args: SQLiteBindValue[] = [];
  if (filter.subjectId) {
    clauses.push('p.subject_id=?');
    args.push(filter.subjectId);
  }
  if (filter.subjectCode) {
    clauses.push('s.code=?');
    args.push(filter.subjectCode.toUpperCase());
  }
  if (filter.subjectName) {
    clauses.push('LOWER(s.name) LIKE ?');
    args.push(`%${String(filter.subjectName).toLowerCase()}%`);
  }
  const cat = normalizeCategoryCode(filter.categoryCode);
  if (cat) {
    clauses.push('c.code=?');
    args.push(cat);
  }
  if (filter.year) {
    clauses.push('p.year=?');
    args.push(filter.year);
  }
  if (filter.paperNumber) {
    clauses.push('p.paper_number=?');
    args.push(filter.paperNumber);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db.getAllAsync<any>(
    `SELECT p.*, s.name subject_name, c.code category_code
     FROM exam_papers p
     JOIN subjects s ON s.id=p.subject_id
     JOIN exam_categories c ON c.id=s.category_id
     ${where}
     ORDER BY p.year, p.paper_number`,
    ...args,
  );
  return rows.map((row) => ({
    ...mapPaper(row),
    subjectName: row.subject_name,
    categoryCode: row.category_code,
  }));
}

export async function listSectionsForPaper(
  db: SQLiteDatabase,
  paperId: string,
): Promise<(ExamSection & { sortOrder: number })[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT s.*, ps.sort_order
     FROM paper_sections ps
     JOIN exam_sections s ON s.id=ps.section_id
     WHERE ps.paper_id=?
     ORDER BY ps.sort_order, s.name`,
    paperId,
  );
  return rows.map((row) => ({ ...mapSection(row), sortOrder: row.sort_order || 0 }));
}

export async function listQuestionsForPaper(
  db: SQLiteDatabase,
  filter: {
    paperId?: string;
    sectionId?: string;
    year?: number;
    subjectName?: string;
    subjectCode?: string;
    categoryCode?: string;
    paperNumber?: number;
    topic?: string;
    page?: number;
    pageSize?: number;
    rootOnly?: boolean;
  },
): Promise<{ items: QuestionListItem[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const page = Math.max(1, filter.page || 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize || 5));
  const clauses: string[] = ['q.parent_question_id IS NULL'];
  const args: SQLiteBindValue[] = [];

  if (filter.rootOnly === false) {
    clauses.length = 0;
  }
  if (filter.paperId) {
    clauses.push('pq.paper_id=?');
    args.push(filter.paperId);
  }
  if (filter.sectionId) {
    clauses.push('pq.section_id=?');
    args.push(filter.sectionId);
  }
  if (filter.year) {
    clauses.push('p.year=?');
    args.push(filter.year);
  }
  if (filter.paperNumber) {
    clauses.push('p.paper_number=?');
    args.push(filter.paperNumber);
  }
  if (filter.subjectCode) {
    clauses.push('s.code=?');
    args.push(filter.subjectCode.toUpperCase());
  }
  if (filter.subjectName) {
    clauses.push('LOWER(s.name) LIKE ?');
    args.push(`%${String(filter.subjectName).toLowerCase()}%`);
  }
  if (filter.topic) {
    clauses.push('LOWER(q.topic) LIKE ?');
    args.push(`%${String(filter.topic).toLowerCase()}%`);
  }
  const cat = normalizeCategoryCode(filter.categoryCode) || filter.categoryCode;
  if (cat) {
    clauses.push('c.code=?');
    args.push(String(cat).toUpperCase());
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const base = `
    FROM paper_questions pq
    JOIN exam_questions q ON q.id=pq.question_id
    JOIN exam_papers p ON p.id=pq.paper_id
    JOIN subjects s ON s.id=p.subject_id
    JOIN exam_categories c ON c.id=s.category_id
    LEFT JOIN exam_sections sec ON sec.id=pq.section_id
    ${where}`;

  const countRow = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count ${base}`,
    ...args,
  );
  const total = countRow?.count || 0;
  const offset = (page - 1) * pageSize;
  const rows = await db.getAllAsync<any>(
    `SELECT q.id,q.number_label,q.topic,q.marks,q.prompt_md,
            c.code category_code,s.name subject_name,p.id paper_id,p.year,p.paper_number,sec.name section_name
     ${base}
     ORDER BY p.year, p.paper_number, pq.sort_order, q.number_label
     LIMIT ? OFFSET ?`,
    ...args,
    pageSize,
    offset,
  );
  return {
    items: rows.map((row) => ({
      id: row.id,
      numberLabel: row.number_label,
      topic: row.topic || '',
      marks: row.marks || 0,
      stem: clip(row.prompt_md || '', 90),
      categoryCode: row.category_code,
      subjectName: row.subject_name,
      year: row.year,
      paperNumber: row.paper_number,
      paperId: row.paper_id,
      sectionName: row.section_name || undefined,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getQuestionTree(
  db: SQLiteDatabase,
  id: string,
): Promise<ExamQuestionNode | null> {
  const row = await db.getFirstAsync<any>('SELECT * FROM exam_questions WHERE id=?', id);
  if (!row) return null;
  const childrenRows = await db.getAllAsync<any>(
    'SELECT * FROM exam_questions WHERE parent_question_id=? ORDER BY number_label',
    id,
  );
  const children: ExamQuestionNode[] = [];
  for (const child of childrenRows) {
    const tree = await getQuestionTree(db, child.id);
    if (tree) children.push(tree);
  }
  return {
    ...mapQuestion(row),
    children: children.length ? children : undefined,
  };
}

export async function saveEntityEmbedding(
  db: SQLiteDatabase,
  level: ExamEntityLevel,
  id: string,
  vector: number[],
) {
  const table =
    level === 'category'
      ? 'exam_categories'
      : level === 'subject'
        ? 'subjects'
        : level === 'paper'
          ? 'exam_papers'
          : level === 'section'
            ? 'exam_sections'
            : 'exam_questions';
  await db.runAsync(`UPDATE ${table} SET embedding_json=? WHERE id=?`, JSON.stringify(vector), id);
}

export async function reindexEntityEmbeddings(db: SQLiteDatabase, embeddings: EmbeddingProvider) {
  await embeddings.initialize();
  const categories = await listCategories(db);
  for (const cat of categories) {
    const text = embedTextCategory(cat);
    const [vector] = await embeddings.embedDocuments([text], [cat.code]);
    await saveEntityEmbedding(db, 'category', cat.id, vector);
  }
  const subjects = await listSubjects(db);
  for (const sub of subjects) {
    const cat = categories.find((c) => c.id === sub.categoryId);
    const text = embedTextSubject(sub, cat?.code);
    const [vector] = await embeddings.embedDocuments([text], [sub.code]);
    await saveEntityEmbedding(db, 'subject', sub.id, vector);
  }
  const papers = await listPapers(db);
  for (const paper of papers) {
    const text = embedTextPaper(paper, paper.subjectName);
    const [vector] = await embeddings.embedDocuments([text], [paper.reference || paper.id]);
    await saveEntityEmbedding(db, 'paper', paper.id, vector);
  }
  const sections = await db.getAllAsync<any>('SELECT * FROM exam_sections');
  for (const row of sections) {
    const section = mapSection(row);
    const text = embedTextSection(section);
    const [vector] = await embeddings.embedDocuments([text], [section.code]);
    await saveEntityEmbedding(db, 'section', section.id, vector);
  }
  const questions = await db.getAllAsync<any>('SELECT * FROM exam_questions');
  for (const row of questions) {
    const q = mapQuestion(row);
    const text = embedTextQuestion(q);
    const [vector] = await embeddings.embedDocuments([text], [q.topic || q.id]);
    await saveEntityEmbedding(db, 'question', q.id, vector);
  }
}

export async function searchEntitiesByEmbedding(input: {
  db: SQLiteDatabase;
  queryVec: number[];
  levels?: ExamEntityLevel[];
  filters?: {
    categoryCode?: string;
    subjectCode?: string;
    subjectName?: string;
    year?: number;
  };
  topK?: number;
}): Promise<ExamSearchHit[]> {
  const levels = input.levels?.length
    ? input.levels
    : (['category', 'subject', 'paper', 'section', 'question'] as ExamEntityLevel[]);
  const topK = input.topK || 8;
  const hits: ExamSearchHit[] = [];
  const cat = normalizeCategoryCode(input.filters?.categoryCode);

  if (levels.includes('category')) {
    const rows = await input.db.getAllAsync<any>(
      'SELECT id,code,name,description_md,embedding_json FROM exam_categories',
    );
    for (const row of rows) {
      const embedding = parseEmbedding(row.embedding_json);
      if (!embedding) continue;
      hits.push({
        level: 'category',
        id: row.id,
        score: cosine(input.queryVec, embedding),
        label: `${row.code} ${row.name}`,
        snippet: clip(row.description_md || row.name, 120),
      });
    }
  }

  if (levels.includes('subject')) {
    const rows = await input.db.getAllAsync<any>(
      `SELECT s.*, c.code category_code FROM subjects s
       JOIN exam_categories c ON c.id=s.category_id`,
    );
    for (const row of rows) {
      if (cat && row.category_code !== cat) continue;
      const embedding = parseEmbedding(row.embedding_json);
      if (!embedding) continue;
      hits.push({
        level: 'subject',
        id: row.id,
        score: cosine(input.queryVec, embedding),
        label: `${row.category_code} ${row.name}`,
        snippet: clip(row.description_md || row.name, 120),
      });
    }
  }

  if (levels.includes('paper')) {
    const papers = await listPapers(input.db, {
      categoryCode: cat,
      subjectCode: input.filters?.subjectCode,
      subjectName: input.filters?.subjectName,
      year: input.filters?.year,
    });
    for (const paper of papers) {
      const row = await input.db.getFirstAsync<any>(
        'SELECT embedding_json, description_md FROM exam_papers WHERE id=?',
        paper.id,
      );
      const embedding = parseEmbedding(row?.embedding_json);
      if (!embedding) continue;
      hits.push({
        level: 'paper',
        id: paper.id,
        score: cosine(input.queryVec, embedding),
        label: `${paper.subjectName || ''} ${paper.year} Paper ${paper.paperNumber}`.trim(),
        snippet: clip(row?.description_md || paper.reference || '', 120),
      });
    }
  }

  if (levels.includes('section')) {
    const rows = await input.db.getAllAsync<any>('SELECT * FROM exam_sections');
    for (const row of rows) {
      const embedding = parseEmbedding(row.embedding_json);
      if (!embedding) continue;
      hits.push({
        level: 'section',
        id: row.id,
        score: cosine(input.queryVec, embedding),
        label: row.name,
        snippet: clip(row.description_md || row.name, 120),
      });
    }
  }

  if (levels.includes('question')) {
    let sql = `SELECT q.*, c.code category_code, s.name subject_name, s.code subject_code, p.year
      FROM exam_questions q
      LEFT JOIN paper_questions pq ON pq.question_id=q.id
      LEFT JOIN exam_papers p ON p.id=pq.paper_id
      LEFT JOIN subjects s ON s.id=p.subject_id
      LEFT JOIN exam_categories c ON c.id=s.category_id`;
    const clauses: string[] = [];
    const args: SQLiteBindValue[] = [];
    if (cat) {
      clauses.push('c.code=?');
      args.push(cat);
    }
    if (input.filters?.subjectCode) {
      clauses.push('s.code=?');
      args.push(input.filters.subjectCode.toUpperCase());
    }
    if (input.filters?.subjectName) {
      clauses.push('LOWER(s.name) LIKE ?');
      args.push(`%${String(input.filters.subjectName).toLowerCase()}%`);
    }
    if (input.filters?.year) {
      clauses.push('p.year=?');
      args.push(input.filters.year);
    }
    if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
    const rows = await input.db.getAllAsync<any>(sql, ...args);
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const embedding = parseEmbedding(row.embedding_json);
      if (!embedding) continue;
      hits.push({
        level: 'question',
        id: row.id,
        score: cosine(input.queryVec, embedding),
        label: `${row.subject_name || ''} Q${row.number_label}`.trim(),
        snippet: clip(row.prompt_md || '', 120),
      });
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, topK);
}

/**
 * Keyword fallback when embeddings are missing or too sparse (e.g. first web search
 * before a heavy model finishes indexing).
 */
export async function keywordSearchExamBank(
  db: SQLiteDatabase,
  query: string,
  filters: {
    categoryCode?: string;
    subjectCode?: string;
    subjectName?: string;
    year?: number;
  } = {},
  topK = 8,
): Promise<ExamSearchHit[]> {
  const tokens = String(query || '')
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 3)
    .slice(0, 6);
  if (!tokens.length) return [];

  const clauses: string[] = ['q.parent_question_id IS NULL'];
  const args: SQLiteBindValue[] = [];
  const cat = normalizeCategoryCode(filters.categoryCode) || filters.categoryCode;
  if (cat) {
    clauses.push('c.code=?');
    args.push(String(cat).toUpperCase());
  }
  if (filters.subjectCode) {
    clauses.push('s.code=?');
    args.push(filters.subjectCode.toUpperCase());
  }
  if (filters.subjectName) {
    clauses.push('LOWER(s.name) LIKE ?');
    args.push(`%${String(filters.subjectName).toLowerCase()}%`);
  }
  if (filters.year) {
    clauses.push('p.year=?');
    args.push(filters.year);
  }
  const tokenClauses = tokens.map(() => '(LOWER(q.topic) LIKE ? OR LOWER(q.prompt_md) LIKE ?)');
  clauses.push(`(${tokenClauses.join(' OR ')})`);
  for (const token of tokens) {
    args.push(`%${token}%`, `%${token}%`);
  }

  const rows = await db.getAllAsync<any>(
    `SELECT q.id, q.number_label, q.topic, q.prompt_md, s.name subject_name, p.year
     FROM exam_questions q
     JOIN paper_questions pq ON pq.question_id=q.id
     JOIN exam_papers p ON p.id=pq.paper_id
     JOIN subjects s ON s.id=p.subject_id
     JOIN exam_categories c ON c.id=s.category_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY p.year DESC, pq.sort_order
     LIMIT ?`,
    ...args,
    Math.max(topK * 2, 12),
  );

  const scored = rows.map((row) => {
    const hay = `${row.topic || ''} ${row.prompt_md || ''}`.toLowerCase();
    const score =
      tokens.reduce((sum, token) => sum + (hay.includes(token) ? 1 : 0), 0) / tokens.length;
    return {
      level: 'question' as const,
      id: String(row.id),
      score,
      label: `${row.subject_name || ''} Q${row.number_label}`.trim(),
      snippet: clip(row.prompt_md || row.topic || '', 120),
    };
  });

  const seen = new Set<string>();
  return scored
    .sort((a, b) => b.score - a.score)
    .filter((hit) => {
      if (seen.has(hit.id)) return false;
      seen.add(hit.id);
      return true;
    })
    .slice(0, topK);
}

/** Legacy flat list for older callers / sync. */
export async function getQuestionsFlat(db: SQLiteDatabase): Promise<ExamQuestion[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT q.*, c.code category_code, s.name subject_name, p.year, p.paper_number
     FROM exam_questions q
     JOIN paper_questions pq ON pq.question_id=q.id
     JOIN exam_papers p ON p.id=pq.paper_id
     JOIN subjects s ON s.id=p.subject_id
     JOIN exam_categories c ON c.id=s.category_id
     WHERE q.parent_question_id IS NULL
     ORDER BY p.year, p.paper_number, pq.sort_order`,
  );
  return rows.map((row) => ({
    id: row.id,
    category: row.category_code === 'GCE_AL' ? 'AL' : 'OL',
    subject: row.subject_name,
    year: row.year,
    paper: row.paper_number,
    number: Number(String(row.number_label).replace(/\D/g, '')) || 0,
    topic: row.topic || '',
    marks: row.marks || 0,
    markdown: row.prompt_md || '',
    answerMarkdown: row.answer_md || '',
    explanationMarkdown: row.solution_md || '',
    hints: JSON.parse(row.hints_json || '[]'),
    tags: JSON.parse(row.tags_json || '[]'),
  }));
}

export async function getQuestionFlat(
  db: SQLiteDatabase,
  id: string,
): Promise<ExamQuestion | undefined> {
  const tree = await getQuestionTree(db, id);
  if (!tree) return undefined;
  const link = await db.getFirstAsync<any>(
    `SELECT c.code category_code, s.name subject_name, p.year, p.paper_number
     FROM paper_questions pq
     JOIN exam_papers p ON p.id=pq.paper_id
     JOIN subjects s ON s.id=p.subject_id
     JOIN exam_categories c ON c.id=s.category_id
     WHERE pq.question_id=? LIMIT 1`,
    id,
  );
  return {
    id: tree.id,
    category: link?.category_code === 'GCE_AL' ? 'AL' : 'OL',
    subject: link?.subject_name || '',
    year: link?.year || 0,
    paper: link?.paper_number || 1,
    number: Number(String(tree.numberLabel).replace(/\D/g, '')) || 0,
    topic: tree.topic,
    marks: tree.marks,
    markdown: tree.promptMd,
    answerMarkdown: tree.answerMd,
    explanationMarkdown: tree.solutionMd,
    hints: tree.hints,
    tags: tree.tags,
  };
}

function mapCategory(row: any): ExamCategory {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    descriptionMd: row.description_md || '',
  };
}

function mapSubject(row: any): ExamSubject {
  return {
    id: row.id,
    categoryId: row.category_id,
    code: row.code,
    name: row.name,
    descriptionMd: row.description_md || '',
  };
}

function mapPaper(row: any): ExamPaper {
  return {
    id: row.id,
    subjectId: row.subject_id,
    year: row.year,
    paperNumber: row.paper_number,
    title: row.title || undefined,
    reference: row.reference || undefined,
    durationMinutes: row.duration_minutes ?? undefined,
    descriptionMd: row.description_md || '',
  };
}

function mapSection(row: any): ExamSection {
  return {
    id: row.id,
    subjectId: row.subject_id || undefined,
    code: row.code,
    name: row.name,
    descriptionMd: row.description_md || '',
  };
}

function mapQuestion(row: any): ExamQuestionNode {
  return {
    id: row.id,
    parentQuestionId: row.parent_question_id || undefined,
    numberLabel: row.number_label || '',
    topic: row.topic || '',
    marks: row.marks || 0,
    durationMinutes: row.duration_minutes ?? undefined,
    promptMd: row.prompt_md || '',
    answerMd: row.answer_md || '',
    solutionMd: row.solution_md || '',
    promptRenderedHtml: row.prompt_rendered_html || undefined,
    answerRenderedHtml: row.answer_rendered_html || undefined,
    solutionRenderedHtml: row.solution_rendered_html || undefined,
    options: row.options_json ? JSON.parse(row.options_json) : undefined,
    hints: JSON.parse(row.hints_json || '[]'),
    tags: JSON.parse(row.tags_json || '[]'),
  };
}

function parseEmbedding(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function clip(value: string, max: number) {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function embedTextCategory(cat: ExamCategory) {
  return `${cat.code} ${cat.name}\n${cat.descriptionMd}`;
}
export function embedTextSubject(sub: ExamSubject, categoryCode?: string) {
  return `${categoryCode || ''} ${sub.code} ${sub.name}\n${sub.descriptionMd}`.trim();
}
export function embedTextPaper(paper: ExamPaper, subjectName?: string) {
  return `${subjectName || ''} ${paper.year} Paper ${paper.paperNumber} ${paper.title || ''} ${paper.reference || ''}\n${paper.descriptionMd}`.trim();
}
export function embedTextSection(section: ExamSection) {
  return `${section.code} ${section.name}\n${section.descriptionMd}`;
}
export function embedTextQuestion(q: ExamQuestionNode) {
  return `Q${q.numberLabel} ${q.topic}\n${q.promptMd}\n${clip(q.answerMd || '', 160)}`;
}
