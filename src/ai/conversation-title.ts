import type { ChatModel } from '@/ai/chat-model';

export const DEFAULT_CONVERSATION_TITLE = 'New study chat';

export function isDefaultConversationTitle(title?: string | null) {
  const t = (title || '').trim();
  return !t || t === DEFAULT_CONVERSATION_TITLE;
}

/** Deterministic fallback when the model is unavailable. */
export function fallbackConversationTitle(prompt: string) {
  const cleaned = prompt.replace(/\s+/g, ' ').trim();
  if (!cleaned) return DEFAULT_CONVERSATION_TITLE;
  return cleaned.length > 42 ? `${cleaned.slice(0, 39)}…` : cleaned;
}

function cleanGeneratedTitle(raw: string) {
  let title = String(raw || '')
    .split('\n')[0]
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^title\s*:\s*/i, '')
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (title.length > 48) title = `${title.slice(0, 45)}…`;
  return title;
}

/**
 * Ask the local chat model for a short ChatGPT-style conversation title.
 * Falls back to a clipped prompt if generation fails.
 */
export async function generateConversationTitle(
  chat: ChatModel,
  prompt: string,
): Promise<string> {
  const fallback = fallbackConversationTitle(prompt);
  try {
    await chat.initialize();
    const raw = await chat.generate(
      [
        {
          role: 'system',
          content:
            'You name study chats. Reply with a short title only (3 to 6 words). ' +
            'No quotes, no trailing punctuation, no explanation.',
        },
        {
          role: 'user',
          content: `Name this chat:\n${prompt.slice(0, 400)}`,
        },
      ],
      undefined,
      { maxTokens: 24, temperature: 0.2 },
    );
    const title = cleanGeneratedTitle(raw);
    if (!title || isDefaultConversationTitle(title)) return fallback;
    // Reject titles that are basically the whole prompt dumped back.
    if (title.length > 8 && prompt.toLowerCase().startsWith(title.toLowerCase()) && title.length > 36) {
      return fallback;
    }
    return title;
  } catch {
    return fallback;
  }
}
