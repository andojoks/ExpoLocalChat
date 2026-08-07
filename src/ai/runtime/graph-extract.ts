import type { SQLiteDatabase } from 'expo-sqlite';
import type { EmbeddingProvider } from '@/ai/embeddings/embedding';
import { upsertKgEdge, upsertKgNode } from '@/db/database';
import type { ExamSlots } from '@/domain/types';

function nodeId(kind: string, key: string) {
  return `${kind}:${key}`.toLowerCase().replace(/\s+/g, '-');
}

/** Deterministic entity extraction into the conversation knowledge graph. */
export async function extractAndLinkTurn(input: {
  db: SQLiteDatabase;
  embeddings: EmbeddingProvider;
  conversationId: string;
  messageId: string;
  role: 'user' | 'assistant';
  text: string;
  slots?: ExamSlots;
  questionIds?: string[];
}) {
  const { db, embeddings, conversationId, messageId, role, text, slots, questionIds } = input;
  const createdAt = Date.now();
  const msgNode = `msg:${messageId}`;
  await upsertKgNode(db, {
    id: msgNode,
    conversationId,
    kind: 'Message',
    label: text.slice(0, 120),
    refId: messageId,
    props: { role },
    createdAt,
  });

  const entities: { kind: string; label: string; refId?: string }[] = [];
  if (slots?.category) entities.push({ kind: 'Category', label: slots.category });
  if (slots?.subject) entities.push({ kind: 'Subject', label: slots.subject });
  if (slots?.topic) entities.push({ kind: 'Topic', label: slots.topic });
  if (slots?.year) entities.push({ kind: 'Year', label: String(slots.year) });
  if (slots?.paper) entities.push({ kind: 'Paper', label: `Paper ${slots.paper}` });
  for (const id of questionIds || []) {
    entities.push({ kind: 'Question', label: id, refId: id });
  }
  const yearMatch = text.match(/\b(20\d{2})\b/g) || [];
  for (const y of yearMatch) entities.push({ kind: 'Year', label: y });

  for (const entity of entities) {
    const id = nodeId('ent', `${entity.kind}-${entity.refId || entity.label}`);
    let embedding: number[] | undefined;
    try {
      embedding = (await embeddings.embedDocuments([entity.label], [entity.kind]))[0];
    } catch {
      embedding = undefined;
    }
    await upsertKgNode(db, {
      id,
      conversationId,
      kind: 'Entity',
      label: entity.label,
      refId: entity.refId,
      props: { entityKind: entity.kind },
      embedding,
      createdAt,
    });
    await upsertKgEdge(db, {
      id: `edge:${msgNode}:${id}:mentions`,
      conversationId,
      fromId: msgNode,
      toId: id,
      rel: role === 'user' ? 'ASKS_ABOUT' : 'MENTIONS',
      createdAt,
    });
    if (entity.kind === 'Question' && entity.refId) {
      await upsertKgEdge(db, {
        id: `edge:${msgNode}:${id}:refers`,
        conversationId,
        fromId: msgNode,
        toId: id,
        rel: 'REFERS_TO_QUESTION',
        createdAt,
      });
    }
  }
}

export function questionIdsFromToolOutput(output: unknown): string[] {
  const ids: string[] = [];
  if (!output || typeof output !== 'object') return ids;
  const obj = output as Record<string, unknown>;
  if (typeof obj.id === 'string' && looksLikeQuestionId(obj.id)) ids.push(obj.id);
  if (Array.isArray(obj.items)) {
    for (const item of obj.items) {
      if (item && typeof item === 'object' && typeof (item as any).id === 'string') {
        const id = (item as any).id as string;
        // Prefer real question rows (have stem / numberLabel) over catalogue entities.
        if ((item as any).stem != null || (item as any).numberLabel != null || looksLikeQuestionId(id)) {
          ids.push(id);
        }
      }
    }
  }
  return [...new Set(ids)];
}

export function questionIdsFromSearchHits(output: unknown): string[] {
  if (!output || typeof output !== 'object') return [];
  const hits = (output as any).hits;
  if (!Array.isArray(hits)) return [];
  return hits
    .filter((hit) => hit && hit.level === 'question' && typeof hit.id === 'string')
    .map((hit) => hit.id as string);
}

function looksLikeQuestionId(id: string) {
  return /-q[\da-z()]+$/i.test(id) || /p\d+-q/i.test(id);
}
