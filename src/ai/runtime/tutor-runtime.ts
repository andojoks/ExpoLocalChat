import type { SQLiteDatabase } from 'expo-sqlite';
import type { ChatModel } from '@/ai/chat-model';
import type { EmbeddingProvider } from '@/ai/embeddings/embedding';
import { indexChatMessage } from '@/ai/memory/conversation-rag';
import {
  buildAnswerTurns,
  buildChitchatTurns,
  formatEvidence,
} from '@/ai/runtime/context-pack';
import {
  examplePrompt,
  loadCatalogueSnapshot,
  matchCategory,
  sampleSubjectNames,
  sampleYears,
  type CatalogueSnapshot,
} from '@/ai/runtime/catalogue-snapshot';
import { looksLikeJsonReply, renderFactsReply, renderToolReply } from '@/ai/runtime/facts';
import { cannedChitchatReply, cannedClarifyReply } from '@/ai/chitchat';
import { extractAndLinkTurn, questionIdsFromSearchHits, questionIdsFromToolOutput } from '@/ai/runtime/graph-extract';
import {
  coerceIntentFromSlots,
  isYearCoverageAsk,
  resolveIntent,
  slotsNeedClarify,
  wantsQuestionList,
  warmIntentGate,
} from '@/ai/runtime/intent-gate';
import { fillSlots, slotsToContext, slotsToSearchArgs, slotsToToolArgs } from '@/ai/runtime/slots';
import { runTool } from '@/ai/runtime/tool-runner';
import { createQuestionTools, type QuestionToolName, type ToolRegistry } from '@/ai/tools';
import {
  appendAgentStep,
  createAgentRun,
  getAgentRun,
  getOpenAgentRun,
  listAgentSteps,
  listKgNeighbors,
  updateAgentRun,
  type AgentRunRow,
  type AgentRunStatus,
} from '@/db/database';
import type {
  AgentContext,
  AgentDebugStep,
  AgentReply,
  ChatMessage,
  ContextUsage,
  ExamSlots,
  ToolTrace,
  TutorIntent,
} from '@/domain/types';
import { estimatePackedTokens, MODEL_CONTEXT_TOKENS, normalizeHistory } from '@/ai/prompts';

export type RuntimePhase = 'route' | 'tool' | 'await_user' | 'answer';

export type TurnHandlers = {
  onPhase?: (phase: RuntimePhase) => void;
  onToken?: (token: string) => void;
  onCheckpoint?: (run: AgentRunRow) => void;
};

export type StartTurnInput = {
  message: string;
  conversationId: string;
  context?: AgentContext;
  history?: ChatMessage[];
  fullExplanation?: boolean;
  userMessageId?: string;
  assistantMessageId?: string;
};

export type TurnResult = AgentReply & {
  runId: string;
  status: Extract<AgentRunStatus, 'completed' | 'awaiting_user' | 'failed'>;
};

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class TutorRuntime {
  private tools: ToolRegistry;
  private warmed = false;
  private catalogue: CatalogueSnapshot | null = null;

  constructor(
    private db: SQLiteDatabase,
    private embeddings: EmbeddingProvider,
    private chat: ChatModel,
  ) {
    this.tools = createQuestionTools(db, embeddings);
  }

  async getRun(runId: string) {
    return getAgentRun(this.db, runId);
  }

  async getOpenRun(conversationId: string) {
    return getOpenAgentRun(this.db, conversationId);
  }

  private async getCatalogue(): Promise<CatalogueSnapshot> {
    if (!this.catalogue) {
      this.catalogue = await loadCatalogueSnapshot(this.db);
    }
    return this.catalogue;
  }

  /** Drop cached catalogue after seed/sync so new subjects appear immediately. */
  invalidateCatalogue() {
    this.catalogue = null;
  }

  async startTurn(input: StartTurnInput, handlers: TurnHandlers = {}): Promise<TurnResult> {
    await this.ensureWarm();
    const open = await getOpenAgentRun(this.db, input.conversationId);
    if (open?.status === 'awaiting_user' || open?.status === 'failed') {
      return this.resumeTurn(open.id, input.message, handlers, input);
    }

    const run = await createAgentRun(this.db, {
      id: id('run'),
      conversationId: input.conversationId,
      status: 'running',
      slots: {},
      activeQuestionId: input.context?.activeQuestionId,
    });
    handlers.onCheckpoint?.(run);
    return this.executePipeline(run.id, input.message, input, handlers, true);
  }

  async resumeTurn(
    runId: string,
    userReply: string,
    handlers: TurnHandlers = {},
    input: Partial<StartTurnInput> = {},
  ): Promise<TurnResult> {
    await this.ensureWarm();
    const run = await getAgentRun(this.db, runId);
    if (!run) throw Error(`Unknown run ${runId}`);
    const priorSlots = run.slots as ExamSlots;
    const merged = fillSlots(userReply, priorSlots, input.context || {});
    await updateAgentRun(this.db, runId, {
      status: 'running',
      slots: merged,
      activeQuestionId: merged.activeQuestionId,
      error: null,
    });
    const refreshed = (await getAgentRun(this.db, runId))!;
    handlers.onCheckpoint?.(refreshed);
    return this.executePipeline(
      runId,
      userReply,
      {
        message: userReply,
        conversationId: run.conversationId,
        context: input.context,
        history: input.history,
        fullExplanation: input.fullExplanation,
        userMessageId: input.userMessageId,
        assistantMessageId: input.assistantMessageId,
      },
      handlers,
      false,
    );
  }

  private async ensureWarm() {
    if (this.warmed) return;
    // Do NOT load the chat LLM here — web Transformers.js download blocks the UI for minutes.
    await this.embeddings.initialize();
    await warmIntentGate(this.embeddings);
    this.warmed = true;
  }

  private async ensureChat() {
    await this.chat.initialize();
  }

  private async executePipeline(
    runId: string,
    message: string,
    input: StartTurnInput,
    handlers: TurnHandlers,
    isFresh: boolean,
  ): Promise<TurnResult> {
    const toolCalls: ToolTrace[] = [];
    const agentDebug: AgentDebugStep[] = [];
    let seq = (await listAgentSteps(this.db, runId)).length;
    const bump = async (kind: string, payload: Record<string, unknown>) => {
      seq += 1;
      await appendAgentStep(this.db, {
        id: id('step'),
        runId,
        seq,
        kind,
        payload,
      });
    };

    try {
      handlers.onPhase?.('route');
      const context = input.context || {};
      const catalogue = await this.getCatalogue();
      const priorSlots = (await getAgentRun(this.db, runId))?.slots as ExamSlots;
      let slots = fillSlots(message, priorSlots, context, catalogue);
      let intent = await resolveIntent(
        message,
        { ...context, ...slotsToContext(slots) },
        this.embeddings,
        catalogue,
      );

      // Resume after clarify: prefer original intent from run if present.
      const existing = await getAgentRun(this.db, runId);
      if (!isFresh && existing?.intent && existing.intent !== 'clarify') {
        intent = existing.intent as TutorIntent;
      }

      intent = coerceIntentFromSlots(intent, slots, message);

      await updateAgentRun(this.db, runId, {
        intent,
        slots,
        activeQuestionId: slots.activeQuestionId,
      });
      await bump('route', { intent, message });
      agentDebug.push({ step: seq, action: 'route', note: intent });
      handlers.onCheckpoint?.((await getAgentRun(this.db, runId))!);

      if (input.userMessageId) {
        await extractAndLinkTurn({
          db: this.db,
          embeddings: this.embeddings,
          conversationId: input.conversationId,
          messageId: input.userMessageId,
          role: 'user',
          text: message,
          slots,
        }).catch(() => undefined);
        await indexChatMessage(this.db, this.embeddings, {
          messageId: input.userMessageId,
          conversationId: input.conversationId,
          role: 'user',
          content: message,
          createdAt: Date.now(),
        }).catch(() => undefined);
      }

      if (intent === 'chitchat') {
        handlers.onPhase?.('answer');
        const canned = cannedChitchatReply(message, catalogue);
        let content = canned;
        if (!content) {
          await this.ensureChat();
          content = await this.chat.generate(buildChitchatTurns(message), handlers.onToken, {
            maxTokens: 180,
            temperature: 0.4,
          });
        } else {
          handlers.onToken?.(content);
        }
        await bump('answer', { content, canned: !!canned });
        agentDebug.push({
          step: seq,
          action: 'answer',
          note: canned ? 'chitchat-canned' : 'chitchat',
        });
        return this.finish(runId, content, slots, toolCalls, agentDebug, 'completed', undefined, catalogue);
      }

      const missing = slotsNeedClarify(intent, slots);
      if (missing) {
        handlers.onPhase?.('await_user');
        slots = { ...slots, missing };
        await updateAgentRun(this.db, runId, { status: 'awaiting_user', slots, intent });
        await bump('clarify', { missing, slots });
        agentDebug.push({ step: seq, action: 'clarify', note: missing });
        const content = cannedClarifyReply(missing, catalogue);
        handlers.onToken?.(content);
        handlers.onCheckpoint?.((await getAgentRun(this.db, runId))!);
        return this.finish(
          runId,
          content,
          slots,
          toolCalls,
          agentDebug,
          'awaiting_user',
          undefined,
          catalogue,
        );
      }

      await bump('slot', { slots });
      agentDebug.push({ step: seq, action: 'slot', note: JSON.stringify(slots) });

      handlers.onPhase?.('tool');
      const planned = planTools(intent, slots, message, input.conversationId, catalogue);
      const evidenceParts: unknown[] = [];
      for (const step of planned) {
        // Skip tools already completed on resume.
        const priorSteps = await listAgentSteps(this.db, runId);
        const already = priorSteps.some(
          (s) =>
            s.kind === 'tool' &&
            s.payload?.name === step.name &&
            JSON.stringify(s.payload?.args) === JSON.stringify(step.args),
        );
        if (already) {
          const prior = priorSteps.find(
            (s) => s.kind === 'tool' && s.payload?.name === step.name,
          );
          if (prior?.payload?.output) evidenceParts.push(prior.payload.output);
          continue;
        }
        const result = await runTool(this.tools, step.name, step.args);
        toolCalls.push(result.trace);
        evidenceParts.push(result.output);
        await bump('tool', {
          name: result.name,
          args: result.args,
          output: result.output,
        });
        agentDebug.push({
          step: seq,
          action: 'tool',
          tool: result.name,
          arguments: result.args,
        });
        const qids = questionIdsFromToolOutput(result.output);
        if (
          qids[0] &&
          (result.name === 'list_exam_questions' ||
            result.name === 'get_question_details' ||
            result.name === 'search_exam_bank')
        ) {
          const questionId =
            result.name === 'search_exam_bank'
              ? questionIdsFromSearchHits(result.output)[0]
              : qids[0];
          if (questionId) slots = { ...slots, activeQuestionId: questionId };
        }
        const paperId = paperIdFromToolOutput(result.name, result.output);
        if (paperId) slots = { ...slots, lastPaperId: paperId };
        await extractAndLinkTurn({
          db: this.db,
          embeddings: this.embeddings,
          conversationId: input.conversationId,
          messageId: input.userMessageId || `tool-${seq}`,
          role: 'user',
          text: message,
          slots,
          questionIds: qids,
        }).catch(() => undefined);
      }

      // If a filtered question list is empty, show papers for that subject (any year).
      if (intent === 'list') {
        const last = evidenceParts[evidenceParts.length - 1] as { items?: unknown[] } | undefined;
        if (
          last &&
          Array.isArray(last.items) &&
          last.items.length === 0 &&
          (slots.subject || slots.subjectCode)
        ) {
          const papers = await runTool(this.tools, 'list_papers', {
            subject: slots.subject,
            subjectCode: slots.subjectCode,
          });
          toolCalls.push(papers.trace);
          evidenceParts.push(papers.output);
          await bump('tool', {
            name: papers.name,
            args: papers.args,
            output: papers.output,
            note: 'empty-list-fallback',
          });
          agentDebug.push({
            step: seq,
            action: 'tool',
            tool: papers.name,
            note: 'empty-list-fallback',
          });
        }
      }

      // Memory + graph only when we still ask the LLM (rare on web).
      let memoryLines: string[] = [];
      let graphLines: string[] = [];

      await updateAgentRun(this.db, runId, {
        status: 'ready_to_answer',
        slots,
        activeQuestionId: slots.activeQuestionId,
      });
      handlers.onCheckpoint?.((await getAgentRun(this.db, runId))!);
      handlers.onPhase?.('answer');

      // Tool-backed intents: deterministic markdown (no SmolLM wait / JSON echo).
      const useDeterministic =
        intent === 'catalogue' ||
        intent === 'list' ||
        intent === 'search' ||
        intent === 'explain';
      let content: string;
      if (useDeterministic) {
        content = renderToolReply(intent, message, evidenceParts);
        handlers.onToken?.(content);
      } else {
        const memory = await runTool(this.tools, 'search_conversation_memory', {
          query: message,
          conversationId: input.conversationId,
          topK: 3,
        }).catch(() => null);
        if (memory) {
          toolCalls.push(memory.trace);
          memoryLines = Array.isArray((memory.output as any)?.hits)
            ? ((memory.output as any).hits as { role: string; text: string }[]).map(
                (h) => `${h.role === 'user' ? 'U' : 'A'}: ${h.text}`,
              )
            : [];
        }
        const graphBits = await listKgNeighbors(
          this.db,
          input.conversationId,
          slots.activeQuestionId ? [`ent:question-${slots.activeQuestionId}`] : [],
        ).catch(() => ({ nodes: [], edges: [] }));
        graphLines = graphBits.nodes.map((n) => `${n.kind}: ${n.label}`);

        const facts = formatEvidence(evidenceParts);
        await this.ensureChat();
        content = await this.chat.generate(
          buildAnswerTurns({
            intent,
            message,
            evidence: facts,
            memoryLines,
            graphLines,
            fullExplanation: input.fullExplanation,
          }),
          handlers.onToken,
          { maxTokens: input.fullExplanation ? 420 : 280, temperature: 0.25 },
        );
        if (looksLikeJsonReply(content)) {
          content = renderFactsReply(intent, message, facts);
        }
      }
      await bump('answer', { content });
      agentDebug.push({ step: seq, action: 'answer' });

      if (input.assistantMessageId) {
        await extractAndLinkTurn({
          db: this.db,
          embeddings: this.embeddings,
          conversationId: input.conversationId,
          messageId: input.assistantMessageId,
          role: 'assistant',
          text: content,
          slots,
          questionIds: slots.activeQuestionId ? [slots.activeQuestionId] : [],
        }).catch(() => undefined);
        await indexChatMessage(this.db, this.embeddings, {
          messageId: input.assistantMessageId,
          conversationId: input.conversationId,
          role: 'assistant',
          content,
          createdAt: Date.now(),
        }).catch(() => undefined);
      }

      return this.finish(
        runId,
        content,
        slots,
        toolCalls,
        agentDebug,
        'completed',
        planned.at(-1)?.name,
        catalogue,
      );
    } catch (error) {
      const note = error instanceof Error ? error.message : String(error);
      await updateAgentRun(this.db, runId, { status: 'failed', error: note });
      await bump('error', { error: note });
      agentDebug.push({ step: seq, action: 'error', note });
      handlers.onCheckpoint?.((await getAgentRun(this.db, runId))!);
      return this.finish(
        runId,
        `I hit a snag loading that from the question bank (${note}). Say retry and I will continue from the last checkpoint.`,
        fillSlots(message, {}, input.context),
        toolCalls,
        agentDebug,
        'failed',
        undefined,
        this.catalogue || undefined,
      );
    }
  }

  private async finish(
    runId: string,
    content: string,
    slots: ExamSlots,
    toolCalls: ToolTrace[],
    agentDebug: AgentDebugStep[],
    status: TurnResult['status'],
    lastTool?: string,
    catalogue?: CatalogueSnapshot,
  ): Promise<TurnResult> {
    await updateAgentRun(this.db, runId, {
      status,
      slots,
      activeQuestionId: slots.activeQuestionId,
      error: status === 'failed' ? undefined : null,
    });
    const context: AgentContext = {
      ...slotsToContext(slots, lastTool),
      activeRunId: status === 'awaiting_user' || status === 'failed' ? runId : undefined,
      lastArguments: slotsToToolArgs(slots),
    };
    const used = estimatePackedTokens(content, JSON.stringify(toolCalls));
    const contextUsage: ContextUsage = {
      usedTokens: used,
      maxTokens: MODEL_CONTEXT_TOKENS,
      percent: Math.min(100, Math.round((used / MODEL_CONTEXT_TOKENS) * 100)),
      full: used > MODEL_CONTEXT_TOKENS * 0.9,
    };
    return {
      content,
      context,
      toolCalls,
      agentDebug,
      suggestions: buildSuggestions(slots, status, catalogue),
      contextUsage,
      runId,
      status,
    };
  }
}

function planTools(
  intent: TutorIntent,
  slots: ExamSlots,
  message: string,
  conversationId: string,
  catalogue?: CatalogueSnapshot,
): { name: QuestionToolName; args: Record<string, unknown> }[] {
  if (intent === 'catalogue') {
    const wantsYears = isYearCoverageAsk(message);
    const wantsSubjects = /\bsubjects?\b/i.test(message);
    const namesLevelInMessage = !!matchCategory(message, catalogue);
    // Inventory asks: do not apply sticky year filters.
    if (wantsYears) {
      const args: Record<string, unknown> = {};
      if (slots.subject) args.subject = slots.subject;
      if (slots.subjectCode) args.subjectCode = slots.subjectCode;
      if (namesLevelInMessage && slots.category) args.category = slots.category;
      return [{ name: 'list_exam_years', args }];
    }
    // Broad "what subjects" should ignore sticky category from prior turns.
    if (wantsSubjects && !namesLevelInMessage) {
      return [
        { name: 'list_exam_categories', args: {} },
        { name: 'list_subjects', args: {} },
      ];
    }
    if (slots.category || slots.subject || wantsSubjects) {
      const args = slotsToToolArgs(slots);
      delete args.year;
      delete args.paper;
      delete args.topic;
      return [{ name: 'list_subjects', args }];
    }
    return [{ name: 'list_exam_categories', args: {} }];
  }
  if (intent === 'explain') {
    return [
      {
        name: 'get_question_details',
        args: { id: slots.activeQuestionId },
      },
    ];
  }
  if (intent === 'list') {
    if (/\bsections?\b/i.test(message) && slots.lastPaperId) {
      return [{ name: 'list_sections', args: { paperId: slots.lastPaperId } }];
    }
    // Bare "Physics" → papers only. Questions need an explicit ask or year/topic/paper.
    if (wantsQuestionList(message, slots) && (slots.subject || slots.year || slots.topic || slots.paper)) {
      return [{ name: 'list_exam_questions', args: slotsToToolArgs(slots) }];
    }
    return [{ name: 'list_papers', args: slotsToToolArgs(slots) }];
  }
  if (intent === 'search') {
    return [
      {
        name: 'search_exam_bank',
        args: slotsToSearchArgs(slots, message),
      },
    ];
  }
  return [
    {
      name: 'search_conversation_memory',
      args: { query: message, conversationId, topK: 3 },
    },
  ];
}

/** Prefer a single concrete paper id from list_papers / list_exam_questions. */
function paperIdFromToolOutput(toolName: string, output: unknown): string | undefined {
  if (!output || typeof output !== 'object') return undefined;
  const obj = output as { items?: Record<string, unknown>[] };
  if (!Array.isArray(obj.items) || !obj.items.length) return undefined;
  if (toolName === 'list_papers') {
    if (obj.items.length === 1 && obj.items[0].id) return String(obj.items[0].id);
    return undefined;
  }
  if (toolName === 'list_exam_questions') {
    const ids = [
      ...new Set(
        obj.items
          .map((item) => (item.paperId != null ? String(item.paperId) : ''))
          .filter(Boolean),
      ),
    ];
    return ids.length === 1 ? ids[0] : undefined;
  }
  return undefined;
}

function buildSuggestions(
  slots: ExamSlots,
  status: TurnResult['status'],
  catalogue?: CatalogueSnapshot,
): string[] {
  const subjects = sampleSubjectNames(catalogue, 3);
  const years = sampleYears(catalogue, 2);
  const example = examplePrompt(catalogue);

  if (status === 'awaiting_user') {
    if (slots.missing === 'subject') {
      return subjects.length ? subjects : ['What subjects are available?'];
    }
    if (slots.missing === 'year') {
      return years.length ? years.map(String) : ['What subjects are available?'];
    }
    if (slots.missing === 'question') {
      return ['Explain that question', `Show ${example}`];
    }
    return [example, 'What subjects are available?'].filter(Boolean);
  }
  const out = ['What subjects are available?'];
  if (slots.subject) out.unshift(`List ${slots.subject} questions`);
  if (slots.activeQuestionId) out.unshift('Explain that question');
  return out.slice(0, 3);
}

export function historyWithoutWelcome(history?: ChatMessage[]) {
  return normalizeHistory(history || []);
}

