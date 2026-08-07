import type { SQLiteDatabase } from 'expo-sqlite';
import { cosine, type EmbeddingProvider } from '@/ai/embeddings/embedding';
import { clipText, RECENT_RAW_TURNS } from '@/ai/prompts';
import type { ChatMessage } from '@/domain/types';
import {
  listMessageEmbeddings,
  saveMessageEmbedding,
  type MessageEmbeddingRow,
} from '@/db/database';

const MEMORY_HIT_CAP = 300;
const TOP_K = 2;

/**
 * Persist a clipped embedding for a chat turn (conversation-memory RAG).
 */
export async function indexChatMessage(
  db: SQLiteDatabase,
  embeddings: EmbeddingProvider,
  input:
    | {
        conversationId: string;
        message: ChatMessage;
      }
    | {
        conversationId: string;
        messageId: string;
        role: string;
        content: string;
        createdAt?: number;
      },
) {
  const messageId = 'message' in input ? input.message.id : input.messageId;
  const role = 'message' in input ? input.message.role : input.role;
  const content = 'message' in input ? input.message.content : input.content;
  const createdAt =
    'message' in input ? input.message.createdAt || Date.now() : input.createdAt || Date.now();
  const text = clipText(content, 240);
  if (!text) return;
  await embeddings.initialize();
  const vector = await embeddings.embedDocuments([text], ['chat-turn']);
  await saveMessageEmbedding(db, {
    messageId,
    conversationId: input.conversationId,
    role,
    text,
    embedding: vector[0],
    createdAt,
  });
}

/**
 * Retrieve top-k older turns relevant to the current student message.
 */
export async function retrieveConversationMemory(input: {
  db: SQLiteDatabase;
  embeddings: EmbeddingProvider;
  conversationId: string;
  query: string;
  history: ChatMessage[];
}): Promise<string[]> {
  const normalized = input.history.filter(
    (message) => message.id !== 'welcome' && message.content.trim(),
  );
  const recentIds = new Set(normalized.slice(-RECENT_RAW_TURNS).map((message) => message.id));
  const rows = await listMessageEmbeddings(input.db, input.conversationId);
  const candidates = rows.filter((row) => !recentIds.has(row.messageId));
  if (!candidates.length || !input.query.trim()) return [];

  await input.embeddings.initialize();
  const queryVector = await input.embeddings.embedQuery(input.query);
  const ranked = candidates
    .map((row) => ({
      row,
      score: cosine(queryVector, row.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  const lines: string[] = [];
  let used = 0;
  for (const { row } of ranked) {
    const line = formatHit(row);
    if (used + line.length > MEMORY_HIT_CAP) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines;
}

function formatHit(row: MessageEmbeddingRow) {
  const prefix = row.role === 'user' ? 'U' : 'A';
  return `${prefix}: ${clipText(row.text, 120)}`;
}
