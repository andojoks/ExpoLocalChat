import type { SQLiteDatabase } from 'expo-sqlite';
import type { EmbeddingProvider } from '@/ai/embeddings/embedding';
import type { AgentContext, AgentReply, ChatMessage } from '@/domain/types';
import type { ChatModel } from './chat-model';
import { TutorGraphAgent, type InvokeOptions } from './graph';

type Input = {
  message: string;
  context: AgentContext;
  history?: ChatMessage[];
  fullExplanation?: boolean;
};

export class QuestionBankAgent {
  private graphAgent: TutorGraphAgent;

  constructor(
    db: SQLiteDatabase,
    embeddings: EmbeddingProvider,
    chat: ChatModel,
    router: ChatModel = chat,
  ) {
    this.graphAgent = new TutorGraphAgent(db, embeddings, chat, router);
  }

  invoke(input: Input, options?: InvokeOptions): Promise<AgentReply> {
    return this.graphAgent.invoke(input, options);
  }
}

export type { InvokeOptions, AgentPhase } from './graph';
