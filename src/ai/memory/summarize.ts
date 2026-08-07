import type { AgentContext, ChatMessage } from '@/domain/types';
import type { ChatModel } from '../chat-model';
import { clipText } from '../prompts';

const SUMMARY_MAX_CHARS = 400;

/** Extractive fallback when LLM summarize is unavailable. */
export function refreshConversationSummary(
  previousSummary: string | undefined,
  olderTurns: ChatMessage[],
  context: AgentContext,
): string {
  const focus = [context.subject, context.topic, context.year, context.activeQuestionId]
    .filter(Boolean)
    .join(' · ');
  const asks = olderTurns
    .filter((m) => m.role === 'user')
    .slice(-2)
    .map((m) => clipText(m.content, 80));
  return clipText(
    [previousSummary, focus && `Focus: ${focus}`, asks.length ? `Asks: ${asks.join(' | ')}` : '']
      .filter(Boolean)
      .join(' '),
    SUMMARY_MAX_CHARS,
  );
}

/** Optional LLM condensation of older turns (ChatModel, no LangChain). */
export async function summarizeOverflow(input: {
  previousSummary?: string;
  olderTurns: ChatMessage[];
  context: AgentContext;
  llm: ChatModel;
}): Promise<string> {
  const fallback = refreshConversationSummary(
    input.previousSummary,
    input.olderTurns,
    input.context,
  );
  if (!input.olderTurns.length) {
    return clipText(input.previousSummary || fallback || '', SUMMARY_MAX_CHARS);
  }
  const digest = input.olderTurns
    .slice(-8)
    .map((message) => {
      const cap = message.role === 'user' ? 100 : 120;
      return `${message.role === 'user' ? 'U' : 'A'}: ${clipText(message.content, cap)}`;
    })
    .join('\n');
  try {
    const text = await input.llm.generate(
      [
        {
          role: 'system',
          content:
            'Summarize this Cameroon GCE tutoring chat into one short paragraph (max 60 words). Keep subject, year, paper, active question ids, and open goals. No JSON.',
        },
        {
          role: 'user',
          content: [
            input.previousSummary ? `Previous summary: ${input.previousSummary}` : null,
            `Focus filters: ${JSON.stringify({
              category: input.context.category,
              subject: input.context.subject,
              topic: input.context.topic,
              year: input.context.year,
              activeQuestionId: input.context.activeQuestionId,
            })}`,
            `Older turns:\n${digest}`,
            'Updated summary:',
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
      undefined,
      { maxTokens: 120, temperature: 0.2 },
    );
    const cleaned = clipText(text.replace(/^Updated summary:\s*/i, ''), SUMMARY_MAX_CHARS);
    return cleaned || fallback;
  } catch {
    return fallback;
  }
}
