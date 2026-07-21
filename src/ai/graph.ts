import type { SQLiteDatabase } from 'expo-sqlite';
import type { EmbeddingProvider } from '@/ai/embeddings/embedding';
import type {
  AgentContext,
  AgentDebugStep,
  AgentReply,
  ChatMessage,
  ContextUsage,
  ToolTrace,
} from '@/domain/types';
import type { ChatModel } from './chat-model';
import { bootstrapExamTool, looksLikeExamQuery } from './exam-intent';
import {
  AGENT_STEP_RETRY_PROMPT,
  AGENT_STEP_SCHEMA,
  AGENT_STEP_SYSTEM_PROMPT,
  buildDecideUserPrompt,
  buildFinalAnswerPrompt,
  clipObservation,
  FINAL_ANSWER_SYSTEM_PROMPT,
  formatScratchpadDigest,
  normalizeHistory,
  packConversationMemory,
  refreshConversationSummary,
  type ScratchpadStep,
} from './prompts';
import { createQuestionTools, type QuestionToolKey } from './tools';

export type AgentPhase = 'plan' | 'tool' | 'answer';

export type InvokeOptions = {
  onToken?: (token: string) => void;
  onPhase?: (phase: AgentPhase) => void;
};

type Input = {
  message: string;
  context: AgentContext;
  history?: ChatMessage[];
  fullExplanation?: boolean;
};

type AgentDecision = {
  action: 'tool' | 'finish';
  tool?: QuestionToolKey;
  arguments?: Record<string, unknown>;
  goal?: string;
};

export const MAX_AGENT_STEPS = 4;
const ANSWER_HISTORY = 3;
const DECIDE_MAX_TOKENS = 100;
const ANSWER_MAX_TOKENS = 320;
const ANSWER_FULL_MAX_TOKENS = 520;

export class TutorGraphAgent {
  private tools;
  constructor(
    db: SQLiteDatabase,
    embeddings: EmbeddingProvider,
    private chat: ChatModel,
    private router: ChatModel = chat,
  ) {
    this.tools = createQuestionTools(db, embeddings);
  }

  async invoke(input: Input, options: InvokeOptions = {}): Promise<AgentReply> {
    const history = normalizeHistory(input.history || []);
    const scratchpad: ScratchpadStep[] = [];
    const toolCalls: ToolTrace[] = [];
    const agentDebug: AgentDebugStep[] = [];
    let context = { ...input.context };
    let lastToolOutput: unknown;
    let forcedToolUsed = false;

    for (let step = 1; step <= MAX_AGENT_STEPS; step++) {
      options.onPhase?.('plan');
      let decision = await this.decide({
        message: input.message,
        context,
        history,
        scratchpad,
        step,
        maxSteps: MAX_AGENT_STEPS,
      });

      if (
        decision.action === 'finish' &&
        !toolCalls.length &&
        !forcedToolUsed &&
        looksLikeExamQuery(input.message, context)
      ) {
        const forced = bootstrapExamTool(input.message, context);
        decision = forced;
        forcedToolUsed = true;
        agentDebug.push({
          step,
          action: 'forced_tool',
          tool: forced.tool,
          arguments: forced.arguments,
          goal: forced.goal,
          note: 'Model chose finish with no tools; forced exam-bank tool',
        });
      } else {
        agentDebug.push({
          step,
          action: decision.action,
          tool: decision.tool,
          arguments: decision.arguments,
          goal: decision.goal,
        });
      }

      if (decision.action === 'finish') break;

      options.onPhase?.('tool');
      const key = decision.tool && decision.tool in this.tools ? decision.tool : undefined;
      if (!key) {
        scratchpad.push({
          goal: decision.goal,
          tool: decision.tool,
          arguments: decision.arguments,
          observation: { error: true },
          error: `Unknown tool: ${decision.tool || '(missing)'}`,
        });
        continue;
      }

      try {
        const selected: any = this.tools[key];
        const args = { ...(decision.arguments || {}) };
        const output = await selected.invoke(args);
        const observation = clipObservation(output);
        lastToolOutput = output;
        context = updateContext(context, key, args, output);
        toolCalls.push({
          name: selected.name,
          input: args,
          resultCount: Array.isArray(output?.items)
            ? output.items.length
            : typeof output?.count === 'number'
              ? output.count
              : undefined,
          preview: observation,
        });
        scratchpad.push({
          goal: decision.goal,
          tool: key,
          arguments: args,
          observation,
        });
      } catch (error) {
        scratchpad.push({
          goal: decision.goal,
          tool: key,
          arguments: decision.arguments,
          observation: { error: true },
          error: error instanceof Error ? error.message : 'Tool failed',
        });
      }
    }

    options.onPhase?.('answer');
    const content = await this.synthesize({
      message: input.message,
      context,
      history,
      scratchpad,
      fullExplanation: input.fullExplanation,
      onToken: options.onToken,
    });

    const olderForSummary = history.slice(0, Math.max(0, history.length - 3));
    context = {
      ...context,
      conversationSummary: refreshConversationSummary(
        context.conversationSummary,
        [
          ...olderForSummary,
          { id: 'u-cur', role: 'user', content: input.message, createdAt: Date.now() },
          { id: 'a-cur', role: 'assistant', content: content, createdAt: Date.now() },
        ],
        context,
      ),
    };

    return {
      content:
        content.trim() ||
        'I am ready, but I did not receive enough signal to answer that well. Could you rephrase it?',
      context,
      toolCalls,
      agentDebug,
      suggestions: defaultSuggestions(lastToolOutput),
      contextUsage: estimateContextUsage(history, context, scratchpad, content),
    };
  }

  private async decide(input: {
    message: string;
    context: AgentContext;
    history: ChatMessage[];
    scratchpad: ScratchpadStep[];
    step: number;
    maxSteps: number;
  }): Promise<AgentDecision> {
    const userPrompt = buildDecideUserPrompt(input);
    let raw = await this.router.generate(
      [
        { role: 'system', content: AGENT_STEP_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      undefined,
      { jsonSchema: AGENT_STEP_SCHEMA, maxTokens: DECIDE_MAX_TOKENS, temperature: 0 },
    );
    let parsed = parseDecision(raw);
    if (!parsed.ok) {
      raw = await this.router.generate(
        [
          { role: 'system', content: AGENT_STEP_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: raw || '{}' },
          { role: 'user', content: AGENT_STEP_RETRY_PROMPT },
        ],
        undefined,
        { jsonSchema: AGENT_STEP_SCHEMA, maxTokens: DECIDE_MAX_TOKENS, temperature: 0 },
      );
      parsed = parseDecision(raw);
    }
    return parsed.decision;
  }

  private async synthesize(input: {
    message: string;
    context: AgentContext;
    history: ChatMessage[];
    scratchpad: ScratchpadStep[];
    fullExplanation?: boolean;
    onToken?: (token: string) => void;
  }) {
    const prior = recentTurns(input.history, ANSWER_HISTORY).filter(
      (turn) => !(turn.role === 'user' && turn.content === input.message),
    );
    return this.chat.generate(
      [
        { role: 'system', content: FINAL_ANSWER_SYSTEM_PROMPT },
        ...prior.map((turn) => ({
          ...turn,
          content:
            turn.role === 'assistant' ? clipTurn(turn.content, 220) : clipTurn(turn.content, 180),
        })),
        {
          role: 'user',
          content: buildFinalAnswerPrompt({
            message: input.message,
            context: input.context,
            history: input.history,
            scratchpad: input.scratchpad,
            fullExplanation: input.fullExplanation,
          }),
        },
      ],
      input.onToken,
      {
        maxTokens: input.fullExplanation ? ANSWER_FULL_MAX_TOKENS : ANSWER_MAX_TOKENS,
        temperature: 0.25,
      },
    );
  }
}

function parseDecision(raw: string): { decision: AgentDecision; ok: boolean } {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
    if (parsed?.action === 'finish') {
      return { decision: { action: 'finish', goal: parsed.goal }, ok: true };
    }
    if (parsed?.action === 'tool') {
      return {
        decision: {
          action: 'tool',
          tool: parsed.tool,
          arguments: parsed.arguments || {},
          goal: parsed.goal,
        },
        ok: true,
      };
    }
  } catch {
    // fall through
  }
  return { decision: { action: 'finish' }, ok: false };
}

function recentTurns(messages: ChatMessage[], limit: number) {
  return messages
    .slice(-limit)
    .map((message) => ({ role: message.role, content: message.content }) as const);
}

function clipTurn(value: string, max: number) {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function updateContext(
  current: AgentContext,
  key: QuestionToolKey,
  args: Record<string, unknown>,
  output: any,
): AgentContext {
  const first = Array.isArray(output?.items) ? output.items[0] : output;
  const resolved = output?.resolvedFilters || {};
  return {
    ...current,
    category: (resolved.category ||
      args.category ||
      first?.category ||
      current.category) as AgentContext['category'],
    subject: (resolved.subject || args.subject || first?.subject || current.subject) as
      | string
      | undefined,
    topic: (resolved.topic || args.topic || first?.topic || current.topic) as string | undefined,
    year: numberOrUndefined(resolved.year || args.year || first?.year || current.year),
    activeQuestionId: first?.id || current.activeQuestionId,
    page: numberOrUndefined(output?.page || args.page || current.page) || 1,
    pageSize: numberOrUndefined(output?.pageSize || args.pageSize || current.pageSize) || 5,
    lastTool: key,
    lastArguments: args,
  };
}

function defaultSuggestions(output: any) {
  const suggestions: string[] = [];
  if (output?.page && output.page > 1) suggestions.push('Previous page');
  if (output?.page && output?.totalPages && output.page < output.totalPages)
    suggestions.push('Next page');
  if (Array.isArray(output?.items) && output.items.length)
    suggestions.push('Explain one question', 'Find similar questions');
  if (!suggestions.length) suggestions.push('Search a topic', 'Show a paper', 'Start a new chat');
  return suggestions;
}

function estimateContextUsage(
  history: ChatMessage[],
  context: AgentContext,
  scratchpad: ScratchpadStep[],
  generated = '',
): ContextUsage {
  const maxTokens = 2048;
  const memory = packConversationMemory(history, context);
  const chars =
    (memory.summary?.length || 0) +
    (memory.recent?.length || 0) +
    formatScratchpadDigest(scratchpad).length +
    generated.length +
    400;
  const usedTokens = Math.ceil(chars / 4);
  const percent = Math.min(100, Math.round((usedTokens / maxTokens) * 100));
  return { usedTokens, maxTokens, percent, full: percent >= 88 };
}

function numberOrUndefined(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = value == null ? undefined : String(value).match(/\d+/);
  return match ? Number(match[0]) : undefined;
}
