import { describe, expect, it, jest } from '@jest/globals';
import { HashEmbeddingProvider } from '../ai/embeddings/embedding';
import { retrieveConversationMemory } from '../ai/memory/conversation-rag';
import {
  buildAnswerTurns,
  buildChitchatTurns,
  buildClarifyTurns,
} from '../ai/runtime/context-pack';
import { estimatePackedTokens, MODEL_CONTEXT_TOKENS, RECENT_RAW_TURNS } from '../ai/prompts';
import type { ChatMessage } from '../domain/types';

function msg(id: string, role: 'user' | 'assistant', content: string): ChatMessage {
  return { id, role, content, createdAt: Date.now() };
}

describe('presentation prompts', () => {
  it('builds chitchat / clarify / answer turns without tool JSON', () => {
    expect(buildChitchatTurns('hi')[0].role).toBe('system');
    expect(buildClarifyTurns('list questions', 'subject', {}).at(-1)?.content).toContain('subject');
    const answer = buildAnswerTurns({
      intent: 'search',
      message: 'Show 2024 biology',
      evidence: '- Biology 2024 Paper 1',
      memoryLines: ['U: osmosis last week'],
    });
    expect(answer[1].content).toContain('Facts:');
    expect(answer[1].content).toContain('osmosis last week');
    expect(answer[1].content).not.toContain('"type":"tool"');
    expect(answer[0].content).toContain('Never JSON');
  });

  it('estimates packed tokens against the device context budget', () => {
    const used = estimatePackedTokens('x'.repeat(400), 'y'.repeat(200));
    expect(used).toBeGreaterThan(100);
    expect(used).toBeLessThan(MODEL_CONTEXT_TOKENS);
  });

  it('keeps recent-turn constant for memory windowing', () => {
    expect(RECENT_RAW_TURNS).toBeGreaterThanOrEqual(4);
    expect(msg('1', 'user', 'hi').id).toBe('1');
  });
});

describe('conversation RAG helpers', () => {
  it('retrieveConversationMemory returns empty when store is empty', async () => {
    const db = {
      getAllAsync: jest.fn(async () => []),
    } as any;
    const hits = await retrieveConversationMemory({
      db,
      embeddings: new HashEmbeddingProvider(),
      conversationId: 'c1',
      query: 'biology 2024',
      history: [msg('1', 'user', 'hello')],
    });
    expect(hits).toEqual([]);
  });
});
