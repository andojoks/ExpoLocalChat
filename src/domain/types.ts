export type ExamQuestion = {
  id: string;
  category: 'OL' | 'AL';
  subject: string;
  year: number;
  paper: 1 | 2 | 3;
  number: number;
  topic: string;
  marks: number;
  markdown: string;
  answerMarkdown: string;
  explanationMarkdown: string;
  hints: string[];
  tags: string[];
};

export type ToolTrace = {
  name: string;
  input: Record<string, unknown>;
  resultCount?: number;
  /** Clipped tool output for debug UI / grounding checks. */
  preview?: unknown;
};

/** Decide-loop audit trail for debug UI (includes finish / forced tools). */
export type AgentDebugStep = {
  step: number;
  action: 'tool' | 'finish' | 'forced_tool';
  tool?: string;
  arguments?: Record<string, unknown>;
  goal?: string;
  note?: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolTrace[];
  agentDebug?: AgentDebugStep[];
  createdAt: number;
};

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  lastMessage?: string;
};

export type ContextUsage = {
  usedTokens: number;
  maxTokens: number;
  percent: number;
  full: boolean;
};

export type AgentContext = {
  activeQuestionId?: string;
  category?: 'OL' | 'AL';
  subject?: string;
  topic?: string;
  year?: number;
  hintIndex?: number;
  page?: number;
  pageSize?: number;
  lastTool?: string;
  lastArguments?: Record<string, unknown>;
  /** Rolling extractive summary of older turns (keeps prompts small). */
  conversationSummary?: string;
};

export type AgentReply = {
  content: string;
  context: AgentContext;
  toolCalls: ToolTrace[];
  agentDebug: AgentDebugStep[];
  suggestions: string[];
  contextUsage: ContextUsage;
};
