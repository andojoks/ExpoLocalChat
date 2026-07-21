import type { AgentContext, ChatMessage } from '@/domain/types';
import type { QuestionToolKey } from './tools';

export const TOOL_KEYS = [
  'inspectCatalogue',
  'listQuestions',
  'retrieveQuestions',
  'getQuestionDetails',
] as const satisfies readonly QuestionToolKey[];

export const AGENT_STEP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: { type: 'string', enum: ['tool', 'finish'] },
    tool: {
      type: 'string',
      enum: [...TOOL_KEYS],
    },
    arguments: { type: 'object', additionalProperties: true },
    goal: { type: 'string' },
  },
};

export const AGENT_STEP_SYSTEM_PROMPT = `QuestionBank tool controller. SQLite is the only exam source of truth.
JSON only: action=tool|finish. Tools: inspectCatalogue, listQuestions, retrieveQuestions, getQuestionDetails.
Prefer tools for papers/years/subjects/topics/questions/answers. Use memory + context for "that/next/again". Pass student phrases in args.`;

export const AGENT_STEP_RETRY_PROMPT =
  'Invalid JSON. Reply JSON only: {"action":"tool"|"finish","tool"?:string,"arguments"?:object,"goal"?:string}';

export const FINAL_ANSWER_SYSTEM_PROMPT = `QuestionBank Tutor for Cameroon GCE. Use memory + tool evidence only—never invent exam facts.
List with source/topic/number/markdown; note pagination; explain with steps + answer + tip; if empty, say so. Keep markdown/LaTeX. No raw JSON.`;

export type ScratchpadStep = {
  goal?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  observation: unknown;
  error?: string;
};

const RECENT_RAW_TURNS = 3;

export function buildDecideUserPrompt(input: {
  message: string;
  context: AgentContext;
  history: ChatMessage[];
  scratchpad: ScratchpadStep[];
  step: number;
  maxSteps: number;
}) {
  const memory = packConversationMemory(input.history, input.context);
  return [
    `Step ${input.step}/${input.maxSteps}`,
    `Context: ${JSON.stringify(compactContext(input.context))}`,
    memory.summary ? `Summary: ${memory.summary}` : null,
    memory.recent ? `Recent:\n${memory.recent}` : 'Recent: (none)',
    `Tools so far:\n${formatScratchpadDigest(input.scratchpad)}`,
    `Student: ${clipText(input.message, 240)}`,
    'Next JSON action.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildFinalAnswerPrompt(input: {
  message: string;
  context: AgentContext;
  history: ChatMessage[];
  scratchpad: ScratchpadStep[];
  fullExplanation?: boolean;
}) {
  const memory = packConversationMemory(input.history, input.context);
  const primary = [...input.scratchpad].reverse().find((step) => !step.error);
  const others = input.scratchpad.filter((step) => step !== primary);
  return [
    `Mode: ${input.fullExplanation ? 'full' : 'concise'}`,
    `Context: ${JSON.stringify(compactContext(input.context))}`,
    memory.summary ? `Summary: ${memory.summary}` : null,
    memory.recent ? `Recent:\n${memory.recent}` : null,
    others.length ? `Other tools:\n${formatScratchpadDigest(others)}` : null,
    primary
      ? `Primary evidence (${primary.tool}):\n${JSON.stringify(clipObservation(primary.observation, 1400))}`
      : input.scratchpad.length
        ? `Tool notes:\n${formatScratchpadDigest(input.scratchpad)}`
        : 'Primary evidence: (none)',
    `Student: ${clipText(input.message, 280)}`,
    'Write the tutor reply.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Compact line digest for decide steps (ids/counts, no full markdown). */
export function formatScratchpadDigest(steps: ScratchpadStep[]) {
  if (!steps.length) return '(none)';
  return steps
    .map((step, index) => {
      if (step.error) return `[${index + 1}] ${step.tool || '?'} ERROR ${clipText(step.error, 80)}`;
      const obs = step.observation as Record<string, unknown> | null;
      const ids = extractIds(obs).slice(0, 6);
      const count =
        typeof obs?.count === 'number'
          ? obs.count
          : Array.isArray(obs?.items)
            ? obs.items.length
            : undefined;
      const page =
        typeof obs?.page === 'number'
          ? ` p${obs.page}/${typeof obs.totalPages === 'number' ? obs.totalPages : '?'}`
          : '';
      const goal = step.goal ? ` (${clipText(step.goal, 40)})` : '';
      const years = Array.isArray(obs?.years) ? ` years=${obs.years.slice(0, 8).join(',')}` : '';
      const subjects = Array.isArray(obs?.subjects)
        ? ` subjects=${obs.subjects.slice(0, 6).join('|')}`
        : '';
      const idPart = ids.length ? ` ids=${ids.join(',')}` : '';
      return `[${index + 1}] ${step.tool}${goal} n=${count ?? '-'}${page}${years}${subjects}${idPart}`;
    })
    .join('\n');
}

export function packConversationMemory(history: ChatMessage[], context: AgentContext) {
  const normalized = normalizeHistory(history);
  const recentMessages = normalized.slice(-RECENT_RAW_TURNS);
  const older = normalized.slice(0, Math.max(0, normalized.length - RECENT_RAW_TURNS));
  const summary =
    refreshConversationSummary(context.conversationSummary, older, context) ||
    context.conversationSummary ||
    '';
  const recent = recentMessages
    .map(
      (message) =>
        `${message.role === 'user' ? 'U' : 'A'}: ${clipText(message.content, 160)}`,
    )
    .join('\n');
  return { summary: clipText(summary, 320), recent };
}

export function refreshConversationSummary(
  previous: string | undefined,
  olderTurns: ChatMessage[],
  context: AgentContext,
) {
  const focus = [
    context.category,
    context.subject,
    context.topic,
    context.year != null ? String(context.year) : undefined,
  ]
    .filter(Boolean)
    .join('/');
  const parts: string[] = [];
  if (focus) parts.push(`Focus ${focus}`);
  if (context.activeQuestionId) parts.push(`Q ${context.activeQuestionId}`);
  if (previous) parts.push(clipText(previous.replace(/^Focus[^.]+\.\s*/, ''), 160));
  const olderUsers = olderTurns.filter((message) => message.role === 'user').slice(-2);
  for (const message of olderUsers) {
    parts.push(`Asked ${clipText(message.content, 72)}`);
  }
  const unique = [...new Set(parts.filter(Boolean))];
  return clipText(unique.join('. '), 320);
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
  };
}

export function clipObservation(value: unknown, maxChars = 900): unknown {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return clipLoose(value, maxChars);
  }
  const source = value as Record<string, unknown>;
  const meta: Record<string, unknown> = {};
  for (const key of [
    'count',
    'page',
    'pageSize',
    'total',
    'totalPages',
    'resolvedFilters',
    'missing',
    'id',
    'categories',
    'subjects',
    'topics',
    'years',
    'papers',
    'broadened',
    'note',
  ]) {
    if (key in source) meta[key] = clipValue(source[key], 12, 100);
  }
  if (Array.isArray(source.items)) {
    meta.items = source.items.slice(0, 4).map((item) => summarizeItem(item));
  } else {
    for (const [key, entry] of Object.entries(source)) {
      if (key in meta || key === 'lastArguments') continue;
      if (['markdown', 'answerMarkdown', 'explanationMarkdown'].includes(key) && typeof entry === 'string') {
        meta[key] = clipText(entry, 220);
        continue;
      }
      if (!(key in meta)) meta[key] = clipValue(entry, 3, 120);
    }
  }
  const encoded = JSON.stringify(meta);
  if (encoded.length <= maxChars) return meta;
  return {
    ...meta,
    items: Array.isArray(meta.items) ? (meta.items as unknown[]).slice(0, 2) : meta.items,
    truncated: true,
  };
}

function summarizeItem(item: unknown) {
  if (!item || typeof item !== 'object') return clipValue(item, 2, 80);
  const row = item as Record<string, unknown>;
  return {
    id: row.id,
    subject: row.subject,
    topic: row.topic,
    year: row.year,
    paper: row.paper,
    number: row.number,
    markdown: typeof row.markdown === 'string' ? clipText(row.markdown, 140) : undefined,
    score: row.score,
  };
}

function clipLoose(value: unknown, maxChars: number) {
  const clipped = clipValue(value, 4, 180);
  const encoded = JSON.stringify(clipped);
  if (encoded.length <= maxChars) return clipped;
  return { truncated: true, preview: encoded.slice(0, maxChars - 1) + '…' };
}

export function normalizeHistory(messages: ChatMessage[]) {
  return messages.filter((message) => message.id !== 'welcome' && message.content.trim());
}

function extractIds(obs: Record<string, unknown> | null | undefined): string[] {
  if (!obs) return [];
  const ids: string[] = [];
  if (typeof obs.id === 'string') ids.push(obs.id);
  if (Array.isArray(obs.items)) {
    for (const item of obs.items) {
      if (item && typeof item === 'object' && typeof (item as any).id === 'string') {
        ids.push((item as any).id);
      }
    }
  }
  return ids;
}

function clipValue(value: unknown, maxItems: number, maxString: number): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return clipText(value, maxString);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.slice(0, maxItems).map((item) => clipValue(item, maxItems, maxString));
  }
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (
      ['markdown', 'answerMarkdown', 'explanationMarkdown'].includes(key) &&
      typeof entry === 'string'
    ) {
      result[key] = clipText(entry, maxString);
      continue;
    }
    if (key === 'hints' && Array.isArray(entry)) {
      result[key] = entry.slice(0, 2).map((hint) => clipValue(hint, maxItems, maxString));
      continue;
    }
    if (key === 'items' && Array.isArray(entry)) {
      result[key] = entry.slice(0, maxItems).map((item) => clipValue(item, maxItems, maxString));
      continue;
    }
    if (key === 'lastArguments') continue;
    result[key] = clipValue(entry, maxItems, maxString);
  }
  return result;
}

function clipText(value: string, max: number) {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}
