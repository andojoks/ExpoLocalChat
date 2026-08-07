import { describe, expect, it } from '@jest/globals';
import {
  DEFAULT_CONVERSATION_TITLE,
  fallbackConversationTitle,
  generateConversationTitle,
  isDefaultConversationTitle,
} from '../ai/conversation-title';
import type { ChatModel } from '../ai/chat-model';

function scriptedChat(reply: string): ChatModel {
  return {
    name: 'scripted',
    async initialize() {},
    async generate() {
      return reply;
    },
  };
}

describe('conversation titles', () => {
  it('detects the default placeholder title', () => {
    expect(isDefaultConversationTitle(DEFAULT_CONVERSATION_TITLE)).toBe(true);
    expect(isDefaultConversationTitle('')).toBe(true);
    expect(isDefaultConversationTitle('Biology Osmosis')).toBe(false);
  });

  it('falls back to a clipped prompt', () => {
    expect(fallbackConversationTitle('Explain osmosis')).toBe('Explain osmosis');
    expect(fallbackConversationTitle('x'.repeat(50)).endsWith('…')).toBe(true);
  });

  it('uses the model reply as a short title', async () => {
    const title = await generateConversationTitle(
      scriptedChat('"Biology Osmosis Review"'),
      'Can you explain the osmosis question from Biology 2024?',
    );
    expect(title).toBe('Biology Osmosis Review');
  });

  it('falls back when the model returns empty', async () => {
    const title = await generateConversationTitle(scriptedChat('   '), 'List Physics papers');
    expect(title).toBe('List Physics papers');
  });
});
