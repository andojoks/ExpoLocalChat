import type { SQLiteDatabase } from 'expo-sqlite';
import { SEED_QUESTIONS } from '@/data/questions';
import type { AgentContext, ChatMessage, ConversationSummary, ExamQuestion } from '@/domain/types';

export async function migrateDatabase(db: SQLiteDatabase) {
  await db.execAsync(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY,code TEXT UNIQUE,name TEXT);
 CREATE TABLE IF NOT EXISTS years(id INTEGER PRIMARY KEY,value INTEGER UNIQUE);
 CREATE TABLE IF NOT EXISTS papers(id INTEGER PRIMARY KEY,category_id INTEGER,year_id INTEGER,subject TEXT,paper_number INTEGER,reference TEXT,UNIQUE(category_id,year_id,subject,paper_number));
 CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY,paper_id INTEGER,number INTEGER,topic TEXT,marks INTEGER,markdown TEXT,answer_markdown TEXT,explanation_markdown TEXT,hints_json TEXT,tags_json TEXT,embedding_json TEXT,updated_at INTEGER);
 CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,title TEXT,context_json TEXT,updated_at INTEGER);
 CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT,role TEXT,content TEXT,tool_calls_json TEXT,created_at INTEGER);
 CREATE TABLE IF NOT EXISTS sync_state(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);`);
  await ensureConversationColumns(db);
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM questions');
  if (!row?.count) await seedDatabase(db);
}

async function ensureConversationColumns(db: SQLiteDatabase) {
  try {
    await db.execAsync('ALTER TABLE conversations ADD COLUMN title TEXT;');
  } catch {}
}

async function seedDatabase(db: SQLiteDatabase) {
  for (const q of SEED_QUESTIONS) await upsertQuestion(db, q);
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_state(key,value,updated_at) VALUES(?,?,?)',
    'seed_version',
    '1',
    Date.now(),
  );
}

export async function upsertQuestion(db: SQLiteDatabase, q: ExamQuestion) {
  await db.runAsync(
    'INSERT OR IGNORE INTO categories(code,name) VALUES(?,?)',
    q.category,
    q.category === 'OL' ? 'Ordinary Level' : 'Advanced Level',
  );
  await db.runAsync('INSERT OR IGNORE INTO years(value) VALUES(?)', q.year);
  const category = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM categories WHERE code=?',
      q.category,
    ),
    year = await db.getFirstAsync<{ id: number }>('SELECT id FROM years WHERE value=?', q.year);
  await db.runAsync(
    'INSERT OR IGNORE INTO papers(category_id,year_id,subject,paper_number,reference) VALUES(?,?,?,?,?)',
    category!.id,
    year!.id,
    q.subject,
    q.paper,
    `GCE-${q.category}-${q.year}-${q.subject.replace(/\s/g, '-')}-P${q.paper}`,
  );
  const paper = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM papers WHERE category_id=? AND year_id=? AND subject=? AND paper_number=?',
    category!.id,
    year!.id,
    q.subject,
    q.paper,
  );
  await db.runAsync(
    `INSERT OR REPLACE INTO questions(id,paper_id,number,topic,marks,markdown,answer_markdown,explanation_markdown,hints_json,tags_json,embedding_json,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT embedding_json FROM questions WHERE id=?),NULL),?)`,
    q.id,
    paper!.id,
    q.number,
    q.topic,
    q.marks,
    q.markdown,
    q.answerMarkdown,
    q.explanationMarkdown,
    JSON.stringify(q.hints),
    JSON.stringify(q.tags),
    q.id,
    Date.now(),
  );
}

export async function getQuestions(db: SQLiteDatabase): Promise<ExamQuestion[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT q.*,p.subject,p.paper_number,c.code category,y.value year FROM questions q JOIN papers p ON p.id=q.paper_id JOIN categories c ON c.id=p.category_id JOIN years y ON y.id=p.year_id`,
  );
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    subject: r.subject,
    year: r.year,
    paper: r.paper_number,
    number: r.number,
    topic: r.topic,
    marks: r.marks,
    markdown: r.markdown,
    answerMarkdown: r.answer_markdown,
    explanationMarkdown: r.explanation_markdown,
    hints: JSON.parse(r.hints_json || '[]'),
    tags: JSON.parse(r.tags_json || '[]'),
  }));
}

export async function getQuestion(db: SQLiteDatabase, id: string) {
  return (await getQuestions(db)).find((q) => q.id === id);
}

export async function saveEmbedding(db: SQLiteDatabase, id: string, vector: number[]) {
  await db.runAsync('UPDATE questions SET embedding_json=? WHERE id=?', JSON.stringify(vector), id);
}

export async function getEmbedding(db: SQLiteDatabase, id: string) {
  const r = await db.getFirstAsync<{ embedding_json: string | null }>(
    'SELECT embedding_json FROM questions WHERE id=?',
    id,
  );
  return r?.embedding_json ? (JSON.parse(r.embedding_json) as number[]) : null;
}

export async function createConversation(db: SQLiteDatabase, title = 'New study chat') {
  const id = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.runAsync(
    'INSERT INTO conversations(id,title,context_json,updated_at) VALUES(?,?,?,?)',
    id,
    title,
    JSON.stringify({}),
    Date.now(),
  );
  return id;
}

export async function ensureConversation(db: SQLiteDatabase, id: string, title = 'New study chat') {
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM conversations WHERE id=?',
    id,
  );
  if (!existing) {
    await db.runAsync(
      'INSERT INTO conversations(id,title,context_json,updated_at) VALUES(?,?,?,?)',
      id,
      title,
      JSON.stringify({}),
      Date.now(),
    );
  }
}

export async function listConversations(db: SQLiteDatabase): Promise<ConversationSummary[]> {
  const rows = await db.getAllAsync<any>(
    `SELECT c.id,c.title,c.updated_at,COUNT(m.id) message_count,
      (SELECT content FROM messages lm WHERE lm.conversation_id=c.id ORDER BY created_at DESC LIMIT 1) last_message
     FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id
     GROUP BY c.id,c.title,c.updated_at
     ORDER BY c.updated_at DESC`,
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title || 'New study chat',
    updatedAt: row.updated_at || 0,
    messageCount: row.message_count || 0,
    lastMessage: row.last_message || undefined,
  }));
}

export async function loadConversation(db: SQLiteDatabase, id: string) {
  const c = await db.getFirstAsync<{ context_json: string }>(
    'SELECT context_json FROM conversations WHERE id=?',
    id,
  );
  const messages = await db.getAllAsync<any>(
    'SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at',
    id,
  );
  return {
    context: c ? JSON.parse(c.context_json || '{}') : {},
    messages: messages.map((m) => {
      const parsed = m.tool_calls_json ? JSON.parse(m.tool_calls_json) : [];
      if (Array.isArray(parsed)) {
        return {
          id: m.id,
          role: m.role,
          content: m.content,
          toolCalls: parsed,
          agentDebug: [],
          createdAt: m.created_at,
        };
      }
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: parsed.calls || [],
        agentDebug: parsed.debug || [],
        createdAt: m.created_at,
      };
    }) as ChatMessage[],
  };
}

export async function saveMessage(
  db: SQLiteDatabase,
  conversationId: string,
  message: ChatMessage,
  context: AgentContext,
) {
  const existing = await db.getFirstAsync<{ title: string | null }>(
    'SELECT title FROM conversations WHERE id=?',
    conversationId,
  );
  const title =
    existing?.title ||
    (message.role === 'user' ? titleFromMessage(message.content) : 'New study chat');
  if (!existing) {
    await db.runAsync(
      'INSERT INTO conversations(id,title,context_json,updated_at) VALUES(?,?,?,?)',
      conversationId,
      title,
      JSON.stringify(context),
      Date.now(),
    );
  } else {
    await db.runAsync(
      'UPDATE conversations SET title=?,context_json=?,updated_at=? WHERE id=?',
      title,
      JSON.stringify(context),
      Date.now(),
      conversationId,
    );
  }
  await db.runAsync(
    'INSERT OR REPLACE INTO messages(id,conversation_id,role,content,tool_calls_json,created_at) VALUES(?,?,?,?,?,?)',
    message.id,
    conversationId,
    message.role,
    message.content,
    JSON.stringify({
      calls: message.toolCalls || [],
      debug: message.agentDebug || [],
    }),
    message.createdAt,
  );
}

export async function clearConversation(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM messages WHERE conversation_id=?', id);
  await db.runAsync(
    'UPDATE conversations SET context_json=?,updated_at=? WHERE id=?',
    JSON.stringify({}),
    Date.now(),
    id,
  );
}

export async function deleteConversation(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM messages WHERE conversation_id=?', id);
  await db.runAsync('DELETE FROM conversations WHERE id=?', id);
}

export async function syncFromRemote(db: SQLiteDatabase, baseUrl: string) {
  const state = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_state WHERE key=?',
    'remote_cursor',
  );
  const response = await fetch(
    `${baseUrl}/api/questions?after=${encodeURIComponent(state?.value || '0')}`,
  );
  if (!response.ok) throw new Error(`Sync failed (${response.status})`);
  const payload = (await response.json()) as { questions: ExamQuestion[]; cursor: string };
  for (const q of payload.questions) await upsertQuestion(db, q);
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_state(key,value,updated_at) VALUES(?,?,?)',
    'remote_cursor',
    payload.cursor,
    Date.now(),
  );
  return payload.questions.length;
}

function titleFromMessage(content: string) {
  const title = content.replace(/\s+/g, ' ').trim();
  return title.length > 34 ? `${title.slice(0, 31)}...` : title || 'New study chat';
}
