/**
 * Facade over TutorRuntime — deterministic tools + streamed presentation.
 * Keeps the previous QuestionBankAgent.invoke shape for the UI.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type { EmbeddingProvider } from '@/ai/embeddings/embedding';
import type { ChatModel } from './chat-model';
import { TutorRuntime, type RuntimePhase } from './runtime/tutor-runtime';
import type { AgentContext, AgentReply, ChatMessage } from '@/domain/types';

export type AgentPhase = 'plan' | 'tool' | 'answer';

export type InvokeOptions = {
  onToken?: (token: string) => void;
  onPhase?: (phase: AgentPhase) => void;
  threadId?: string;
};

/** @deprecated runtime uses checkpoints, not recursion hops */
export const MAX_AGENT_RECURSION = 6;
export const MAX_AGENT_STEPS = MAX_AGENT_RECURSION;

type Input = {
  message: string;
  context: AgentContext;
  history?: ChatMessage[];
  fullExplanation?: boolean;
  userMessageId?: string;
  assistantMessageId?: string;
};

function mapPhase(phase: RuntimePhase): AgentPhase {
  if (phase === 'tool') return 'tool';
  if (phase === 'route') return 'plan';
  return 'answer';
}

export class QuestionBankAgent {
  private runtime: TutorRuntime;

  constructor(db: SQLiteDatabase, embeddings: EmbeddingProvider, chat: ChatModel) {
    this.runtime = new TutorRuntime(db, embeddings, chat);
  }

  async invoke(input: Input, options: InvokeOptions = {}): Promise<AgentReply> {
    const conversationId = options.threadId || `turn-${Date.now()}`;
    const handlers = {
      onToken: options.onToken,
      onPhase: (phase: RuntimePhase) => options.onPhase?.(mapPhase(phase)),
    };
    const result = await this.runtime.startTurn(
      {
        message: input.message,
        conversationId,
        context: input.context,
        history: input.history,
        fullExplanation: input.fullExplanation,
        userMessageId: input.userMessageId,
        assistantMessageId: input.assistantMessageId,
      },
      handlers,
    );
    return result;
  }
}

export { TutorRuntime } from './runtime/tutor-runtime';
