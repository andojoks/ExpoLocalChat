import type { AgentContext, ChatMessage } from '@/domain/types';

export const MODEL_CONTEXT_TOKENS = 2048;
export const RECENT_RAW_TURNS = 6;
export const TOOL_MODEL_CLIP_CHARS = 600;
export const TOOL_UI_PREVIEW_CHARS = 900;

export const CHITCHAT_SYSTEM = `Cameroon GCE tutor. Short markdown. No invented papers. No JSON.`;

export const CLARIFY_SYSTEM = `Cameroon GCE tutor. Ask ONE short question for the missing slot. No JSON.`;

export const ANSWER_SYSTEM = `Cameroon GCE tutor.
Use Facts only. Markdown bullets. Never JSON or keys like count/items/hits.`;

export const EXPLAIN_SYSTEM = `Cameroon GCE tutor.
Teach from Facts only. Short steps. Never JSON.`;

export function clipText(value: unknown, max: number) {
  const raw = value == null ? '' : String(value).trim();
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
}

export function compactContext(context: AgentContext) {
  return {
    activeQuestionId: context.activeQuestionId,
    category: context.category,
    subject: context.subject,
    topic: context.topic,
    year: context.year,
    page: context.page,
    pageSize: context.pageSize,
    lastTool: context.lastTool,
    activeRunId: context.activeRunId,
  };
}

export function normalizeHistory(history: ChatMessage[]) {
  return history.filter((message) => message.id !== 'welcome' && !!message.content?.trim());
}

export function estimatePackedTokens(...chunks: string[]) {
  const chars = chunks.join('').length;
  return Math.ceil(chars / 4);
}
