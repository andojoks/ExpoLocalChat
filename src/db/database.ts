import type { SQLiteDatabase } from 'expo-sqlite';
import type { AgentContext, ChatMessage, ConversationSummary, ExamQuestion } from '@/domain/types';
import {
  DEFAULT_CONVERSATION_TITLE,
  fallbackConversationTitle,
  isDefaultConversationTitle,
} from '@/ai/conversation-title';
import {
  ensureExamBankV2,
  getQuestionFlat,
  getQuestionsFlat,
  saveEntityEmbedding,
} from './exam-bank';

export * from './exam-bank';

export async function migrateDatabase(db: SQLiteDatabase) {
  await db.execAsync(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,title TEXT,context_json TEXT,updated_at INTEGER);
 CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT,role TEXT,content TEXT,tool_calls_json TEXT,created_at INTEGER);
 CREATE TABLE IF NOT EXISTS message_embeddings(message_id TEXT PRIMARY KEY,conversation_id TEXT,role TEXT,text TEXT,embedding_json TEXT,created_at INTEGER);
 CREATE TABLE IF NOT EXISTS sync_state(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);`);
  await ensureConversationColumns(db);
  await ensureMessageEmbeddingsTable(db);
  await ensureKnowledgeGraphTables(db);
  await ensureAgentRunTables(db);
  await ensureExamBankV2(db);
}

async function ensureConversationColumns(db: SQLiteDatabase) {
  try {
    await db.execAsync('ALTER TABLE conversations ADD COLUMN title TEXT;');
  } catch {}
}

async function ensureMessageEmbeddingsTable(db: SQLiteDatabase) {
  await db.execAsync(
    `CREATE TABLE IF NOT EXISTS message_embeddings(
      message_id TEXT PRIMARY KEY,
      conversation_id TEXT,
      role TEXT,
      text TEXT,
      embedding_json TEXT,
      created_at INTEGER
    );`,
  );
}

async function ensureKnowledgeGraphTables(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS kg_nodes(
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      ref_id TEXT,
      props_json TEXT,
      embedding_json TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kg_nodes_conv ON kg_nodes(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_kg_nodes_kind ON kg_nodes(conversation_id, kind);
    CREATE TABLE IF NOT EXISTS kg_edges(
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      rel TEXT NOT NULL,
      props_json TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kg_edges_conv ON kg_edges(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_kg_edges_from ON kg_edges(from_id);
    CREATE INDEX IF NOT EXISTS idx_kg_edges_to ON kg_edges(to_id);
  `);
}

async function ensureAgentRunTables(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS agent_runs(
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      status TEXT NOT NULL,
      intent TEXT,
      slots_json TEXT,
      active_question_id TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_runs_conv ON agent_runs(conversation_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS agent_steps(
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      kind TEXT NOT NULL,
      payload_json TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(run_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_steps_run ON agent_steps(run_id, seq);
  `);
}

export type KgNodeRow = {
  id: string;
  conversationId: string;
  kind: string;
  label: string;
  refId?: string;
  props: Record<string, unknown>;
  embedding?: number[];
  createdAt: number;
};

export type KgEdgeRow = {
  id: string;
  conversationId: string;
  fromId: string;
  toId: string;
  rel: string;
  props: Record<string, unknown>;
  createdAt: number;
};

export async function upsertKgNode(
  db: SQLiteDatabase,
  node: {
    id: string;
    conversationId: string;
    kind: string;
    label: string;
    refId?: string;
    props?: Record<string, unknown>;
    embedding?: number[];
    createdAt?: number;
  },
) {
  await db.runAsync(
    `INSERT OR REPLACE INTO kg_nodes(id,conversation_id,kind,label,ref_id,props_json,embedding_json,created_at)
     VALUES(?,?,?,?,?,?,?,?)`,
    node.id,
    node.conversationId,
    node.kind,
    node.label,
    node.refId || null,
    JSON.stringify(node.props || {}),
    node.embedding ? JSON.stringify(node.embedding) : null,
    node.createdAt || Date.now(),
  );
}

export async function upsertKgEdge(
  db: SQLiteDatabase,
  edge: {
    id: string;
    conversationId: string;
    fromId: string;
    toId: string;
    rel: string;
    props?: Record<string, unknown>;
    createdAt?: number;
  },
) {
  await db.runAsync(
    `INSERT OR REPLACE INTO kg_edges(id,conversation_id,from_id,to_id,rel,props_json,created_at)
     VALUES(?,?,?,?,?,?,?)`,
    edge.id,
    edge.conversationId,
    edge.fromId,
    edge.toId,
    edge.rel,
    JSON.stringify(edge.props || {}),
    edge.createdAt || Date.now(),
  );
}

export async function listKgNodes(
  db: SQLiteDatabase,
  conversationId: string,
  kind?: string,
): Promise<KgNodeRow[]> {
  const rows = kind
    ? await db.getAllAsync<any>(
        'SELECT * FROM kg_nodes WHERE conversation_id=? AND kind=? ORDER BY created_at ASC',
        conversationId,
        kind,
      )
    : await db.getAllAsync<any>(
        'SELECT * FROM kg_nodes WHERE conversation_id=? ORDER BY created_at ASC',
        conversationId,
      );
  return rows.map(mapKgNode);
}

export async function listKgEdges(db: SQLiteDatabase, conversationId: string): Promise<KgEdgeRow[]> {
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM kg_edges WHERE conversation_id=? ORDER BY created_at ASC',
    conversationId,
  );
  return rows.map(mapKgEdge);
}

export async function listKgNeighbors(
  db: SQLiteDatabase,
  conversationId: string,
  nodeIds: string[],
): Promise<{ nodes: KgNodeRow[]; edges: KgEdgeRow[] }> {
  if (!nodeIds.length) return { nodes: [], edges: [] };
  const edges = await listKgEdges(db, conversationId);
  const related = edges.filter((e) => nodeIds.includes(e.fromId) || nodeIds.includes(e.toId));
  const ids = new Set<string>(nodeIds);
  for (const e of related) {
    ids.add(e.fromId);
    ids.add(e.toId);
  }
  const nodes = (await listKgNodes(db, conversationId)).filter((n) => ids.has(n.id));
  return { nodes, edges: related };
}

function mapKgNode(row: any): KgNodeRow {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    kind: row.kind,
    label: row.label,
    refId: row.ref_id || undefined,
    props: JSON.parse(row.props_json || '{}'),
    embedding: row.embedding_json ? (JSON.parse(row.embedding_json) as number[]) : undefined,
    createdAt: row.created_at,
  };
}

function mapKgEdge(row: any): KgEdgeRow {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    fromId: row.from_id,
    toId: row.to_id,
    rel: row.rel,
    props: JSON.parse(row.props_json || '{}'),
    createdAt: row.created_at,
  };
}

export type AgentRunStatus =
  | 'running'
  | 'awaiting_user'
  | 'ready_to_answer'
  | 'completed'
  | 'failed';

export type AgentRunRow = {
  id: string;
  conversationId: string;
  status: AgentRunStatus;
  intent?: string;
  slots: Record<string, unknown>;
  activeQuestionId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

export type AgentStepRow = {
  id: string;
  runId: string;
  seq: number;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: number;
};

export async function createAgentRun(
  db: SQLiteDatabase,
  run: {
    id: string;
    conversationId: string;
    status?: AgentRunStatus;
    intent?: string;
    slots?: Record<string, unknown>;
    activeQuestionId?: string;
  },
): Promise<AgentRunRow> {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO agent_runs(id,conversation_id,status,intent,slots_json,active_question_id,error,created_at,updated_at)
     VALUES(?,?,?,?,?,?,NULL,?,?)`,
    run.id,
    run.conversationId,
    run.status || 'running',
    run.intent || null,
    JSON.stringify(run.slots || {}),
    run.activeQuestionId || null,
    now,
    now,
  );
  return (await getAgentRun(db, run.id))!;
}

export async function updateAgentRun(
  db: SQLiteDatabase,
  id: string,
  patch: {
    status?: AgentRunStatus;
    intent?: string;
    slots?: Record<string, unknown>;
    activeQuestionId?: string | null;
    error?: string | null;
  },
) {
  const current = await getAgentRun(db, id);
  if (!current) return null;
  const status = patch.status ?? current.status;
  const intent = patch.intent ?? current.intent ?? null;
  const slots = patch.slots ?? current.slots;
  const activeQuestionId =
    patch.activeQuestionId === null
      ? null
      : (patch.activeQuestionId ?? current.activeQuestionId ?? null);
  const error = patch.error === null ? null : (patch.error ?? current.error ?? null);
  await db.runAsync(
    `UPDATE agent_runs SET status=?,intent=?,slots_json=?,active_question_id=?,error=?,updated_at=? WHERE id=?`,
    status,
    intent,
    JSON.stringify(slots),
    activeQuestionId,
    error,
    Date.now(),
    id,
  );
  return getAgentRun(db, id);
}

export async function getAgentRun(db: SQLiteDatabase, id: string): Promise<AgentRunRow | null> {
  const row = await db.getFirstAsync<any>('SELECT * FROM agent_runs WHERE id=?', id);
  return row ? mapAgentRun(row) : null;
}

export async function getOpenAgentRun(
  db: SQLiteDatabase,
  conversationId: string,
): Promise<AgentRunRow | null> {
  const row = await db.getFirstAsync<any>(
    `SELECT * FROM agent_runs
     WHERE conversation_id=? AND status IN ('awaiting_user','failed','running','ready_to_answer')
     ORDER BY updated_at DESC LIMIT 1`,
    conversationId,
  );
  return row ? mapAgentRun(row) : null;
}

export async function appendAgentStep(
  db: SQLiteDatabase,
  step: {
    id: string;
    runId: string;
    seq: number;
    kind: string;
    payload?: Record<string, unknown>;
  },
) {
  await db.runAsync(
    `INSERT OR REPLACE INTO agent_steps(id,run_id,seq,kind,payload_json,created_at) VALUES(?,?,?,?,?,?)`,
    step.id,
    step.runId,
    step.seq,
    step.kind,
    JSON.stringify(step.payload || {}),
    Date.now(),
  );
}

export async function listAgentSteps(db: SQLiteDatabase, runId: string): Promise<AgentStepRow[]> {
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM agent_steps WHERE run_id=? ORDER BY seq ASC',
    runId,
  );
  return rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    seq: row.seq,
    kind: row.kind,
    payload: JSON.parse(row.payload_json || '{}'),
    createdAt: row.created_at,
  }));
}

function mapAgentRun(row: any): AgentRunRow {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    status: row.status,
    intent: row.intent || undefined,
    slots: JSON.parse(row.slots_json || '{}'),
    activeQuestionId: row.active_question_id || undefined,
    error: row.error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function clearConversation(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM messages WHERE conversation_id=?', id);
  await db.runAsync('DELETE FROM message_embeddings WHERE conversation_id=?', id);
  await db.runAsync(
    'DELETE FROM agent_steps WHERE run_id IN (SELECT id FROM agent_runs WHERE conversation_id=?)',
    id,
  );
  await db.runAsync('DELETE FROM agent_runs WHERE conversation_id=?', id);
  await db.runAsync('DELETE FROM kg_edges WHERE conversation_id=?', id);
  await db.runAsync('DELETE FROM kg_nodes WHERE conversation_id=?', id);
  await db.runAsync(
    'UPDATE conversations SET title=?,context_json=?,updated_at=? WHERE id=?',
    DEFAULT_CONVERSATION_TITLE,
    JSON.stringify({}),
    Date.now(),
    id,
  );
}

export async function deleteConversation(db: SQLiteDatabase, id: string) {
  await clearConversation(db, id);
  await db.runAsync('DELETE FROM conversations WHERE id=?', id);
}

export type MessageEmbeddingRow = {
  messageId: string;
  conversationId: string;
  role: string;
  text: string;
  embedding: number[];
  createdAt: number;
};

export async function saveMessageEmbedding(
  db: SQLiteDatabase,
  row: {
    messageId: string;
    conversationId: string;
    role: string;
    text: string;
    embedding: number[];
    createdAt: number;
  },
) {
  await db.runAsync(
    `INSERT OR REPLACE INTO message_embeddings(message_id,conversation_id,role,text,embedding_json,created_at)
     VALUES(?,?,?,?,?,?)`,
    row.messageId,
    row.conversationId,
    row.role,
    row.text,
    JSON.stringify(row.embedding),
    row.createdAt,
  );
}

export async function listMessageEmbeddings(
  db: SQLiteDatabase,
  conversationId: string,
): Promise<MessageEmbeddingRow[]> {
  const rows = await db.getAllAsync<{
    message_id: string;
    conversation_id: string;
    role: string;
    text: string;
    embedding_json: string;
    created_at: number;
  }>('SELECT * FROM message_embeddings WHERE conversation_id=? ORDER BY created_at ASC', conversationId);
  return rows.map((row) => ({
    messageId: row.message_id,
    conversationId: row.conversation_id,
    role: row.role,
    text: row.text,
    embedding: JSON.parse(row.embedding_json || '[]') as number[],
    createdAt: row.created_at,
  }));
}

/** @deprecated Prefer hierarchical exam-bank APIs; kept for compatibility. */
export async function upsertQuestion(db: SQLiteDatabase, q: ExamQuestion) {
  // Flat remote sync: upsert as a free-form question linked to a paper synthesized from fields.
  const categoryCode = q.category === 'AL' || q.category === 'GCE_AL' ? 'GCE_AL' : 'GCE_OL';
  const categoryId = categoryCode === 'GCE_AL' ? 'cat-gce-al' : 'cat-gce-ol';
  const subjectCode = String(q.subject || 'GEN')
    .slice(0, 8)
    .toUpperCase()
    .replace(/\s+/g, '_');
  const subjectId = `sub-sync-${categoryCode}-${subjectCode}`.toLowerCase();
  const paperId = `paper-sync-${subjectId}-${q.year}-p${q.paper}`.toLowerCase();
  const now = Date.now();
  await db.runAsync(
    `INSERT OR IGNORE INTO exam_categories(id,code,name,description_md,updated_at) VALUES(?,?,?,?,?)`,
    categoryId,
    categoryCode,
    categoryCode === 'GCE_AL' ? 'GCE Advanced Level' : 'GCE Ordinary Level',
    '',
    now,
  );
  await db.runAsync(
    `INSERT OR IGNORE INTO subjects(id,category_id,code,name,description_md,updated_at) VALUES(?,?,?,?,?,?)`,
    subjectId,
    categoryId,
    subjectCode,
    q.subject,
    '',
    now,
  );
  await db.runAsync(
    `INSERT OR IGNORE INTO exam_papers(id,subject_id,year,paper_number,reference,description_md,updated_at) VALUES(?,?,?,?,?,?,?)`,
    paperId,
    subjectId,
    q.year,
    q.paper,
    `GCE-${categoryCode}-${q.year}-${subjectCode}-P${q.paper}`,
    '',
    now,
  );
  await db.runAsync(
    `INSERT OR REPLACE INTO exam_questions(id,parent_question_id,number_label,topic,marks,prompt_md,answer_md,solution_md,hints_json,tags_json,embedding_json,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT embedding_json FROM exam_questions WHERE id=?),NULL),?)`,
    q.id,
    null,
    String(q.number),
    q.topic,
    q.marks,
    q.markdown,
    q.answerMarkdown,
    q.explanationMarkdown,
    JSON.stringify(q.hints || []),
    JSON.stringify(q.tags || []),
    q.id,
    now,
  );
  await db.runAsync(
    `INSERT OR REPLACE INTO paper_questions(paper_id,question_id,section_id,sort_order) VALUES(?,?,NULL,?)`,
    paperId,
    q.id,
    Number(q.number) || 0,
  );
}

export async function getQuestions(db: SQLiteDatabase): Promise<ExamQuestion[]> {
  return getQuestionsFlat(db);
}

export async function getQuestion(
  db: SQLiteDatabase,
  id: string,
): Promise<ExamQuestion | undefined> {
  return getQuestionFlat(db, id);
}

export async function saveEmbedding(db: SQLiteDatabase, id: string, vector: number[]) {
  await saveEntityEmbedding(db, 'question', id, vector);
}

export async function getEmbedding(db: SQLiteDatabase, id: string) {
  const r = await db.getFirstAsync<{ embedding_json: string | null }>(
    'SELECT embedding_json FROM exam_questions WHERE id=?',
    id,
  );
  return r?.embedding_json ? (JSON.parse(r.embedding_json) as number[]) : null;
}

export async function createConversation(db: SQLiteDatabase, title = DEFAULT_CONVERSATION_TITLE) {
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

export async function ensureConversation(
  db: SQLiteDatabase,
  id: string,
  title = DEFAULT_CONVERSATION_TITLE,
) {
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

export async function updateConversationTitle(db: SQLiteDatabase, id: string, title: string) {
  const cleaned = title.replace(/\s+/g, ' ').trim() || DEFAULT_CONVERSATION_TITLE;
  await db.runAsync(
    'UPDATE conversations SET title=?,updated_at=? WHERE id=?',
    cleaned,
    Date.now(),
    id,
  );
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
    title: row.title || DEFAULT_CONVERSATION_TITLE,
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
          agentTiming: undefined,
          createdAt: m.created_at,
        };
      }
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: parsed.calls || [],
        agentDebug: parsed.debug || [],
        agentTiming: parsed.timing,
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
  // Replace the placeholder title on the first user turn; keep a custom title afterward.
  const title =
    message.role === 'user' && isDefaultConversationTitle(existing?.title)
      ? fallbackConversationTitle(message.content)
      : existing?.title || DEFAULT_CONVERSATION_TITLE;
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
      timing: message.agentTiming,
    }),
    message.createdAt,
  );
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

