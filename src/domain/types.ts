/** Hierarchical Cameroon GCE exam bank domain types. */

export type ExamCategoryCode = 'GCE_OL' | 'GCE_AL';

export type ExamCategory = {
  id: string;
  code: ExamCategoryCode;
  name: string;
  descriptionMd: string;
};

export type ExamSubject = {
  id: string;
  categoryId: string;
  code: string;
  name: string;
  descriptionMd: string;
};

export type ExamPaper = {
  id: string;
  subjectId: string;
  year: number;
  paperNumber: number;
  title?: string;
  reference?: string;
  durationMinutes?: number;
  descriptionMd: string;
};

export type ExamSection = {
  id: string;
  subjectId?: string;
  code: string;
  name: string;
  descriptionMd: string;
};

export type ExamQuestionNode = {
  id: string;
  parentQuestionId?: string;
  numberLabel: string;
  topic: string;
  marks: number;
  durationMinutes?: number;
  promptMd: string;
  answerMd: string;
  solutionMd: string;
  promptRenderedHtml?: string;
  answerRenderedHtml?: string;
  solutionRenderedHtml?: string;
  options?: unknown[];
  hints: string[];
  tags: string[];
  children?: ExamQuestionNode[];
};

/** Slim list row for tools / UI. */
export type QuestionListItem = {
  id: string;
  numberLabel: string;
  topic: string;
  marks: number;
  stem: string;
  categoryCode?: string;
  subjectName?: string;
  year?: number;
  paperNumber?: number;
  paperId?: string;
  sectionName?: string;
  score?: number;
};

export type ExamEntityLevel = 'category' | 'subject' | 'paper' | 'section' | 'question';

export type ExamSearchHit = {
  level: ExamEntityLevel;
  id: string;
  score: number;
  label: string;
  snippet: string;
};

/**
 * Flat legacy view used by older tests / sync adapters.
 * Prefer ExamQuestionNode + pivots for new code.
 */
export type ExamQuestion = {
  id: string;
  category: 'OL' | 'AL' | ExamCategoryCode;
  subject: string;
  year: number;
  paper: number;
  number: number | string;
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
  preview?: unknown;
};

export type AgentDebugStep = {
  step: number;
  action: 'tool' | 'finish' | 'route' | 'slot' | 'clarify' | 'answer' | 'error';
  tool?: string;
  arguments?: Record<string, unknown>;
  goal?: string;
  note?: string;
};

export type AgentTiming = {
  startedAt: number;
  firstTokenAt?: number;
  completedAt: number;
  elapsedMs: number;
  firstTokenMs?: number;
  outputTokens: number;
  tokensPerSecond: number;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolTrace[];
  agentDebug?: AgentDebugStep[];
  agentTiming?: AgentTiming;
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

export type ExamSlots = {
  /** Category code from the exam bank (e.g. GCE_OL); resolved from catalogue snapshot. */
  category?: string;
  subject?: string;
  subjectCode?: string;
  topic?: string;
  year?: number;
  paper?: number;
  sectionId?: string;
  /** Last paper id from list_papers / single-paper question lists (for list_sections). */
  lastPaperId?: string;
  page?: number;
  pageSize?: number;
  activeQuestionId?: string;
  missing?: 'category' | 'subject' | 'year' | 'paper' | 'question';
};

export type TutorIntent =
  | 'chitchat'
  | 'catalogue'
  | 'list'
  | 'search'
  | 'explain'
  | 'clarify';

export type AgentContext = {
  activeQuestionId?: string;
  category?: string;
  subject?: string;
  topic?: string;
  year?: number;
  lastPaperId?: string;
  page?: number;
  pageSize?: number;
  lastTool?: string;
  lastArguments?: Record<string, unknown>;
  conversationSummary?: string;
  activeRunId?: string;
};

export type AgentReply = {
  content: string;
  context: AgentContext;
  toolCalls: ToolTrace[];
  agentDebug: AgentDebugStep[];
  agentTiming?: AgentTiming;
  suggestions: string[];
  contextUsage: ContextUsage;
  runId?: string;
  status?: 'completed' | 'awaiting_user' | 'failed';
};

/** Hierarchical exam-bank payload (pack import / test fixtures). */
export type ExamBankSeed = {
  categories: ExamCategory[];
  subjects: ExamSubject[];
  papers: ExamPaper[];
  sections: ExamSection[];
  questions: Omit<ExamQuestionNode, 'children'>[];
  paperSections: { paperId: string; sectionId: string; sortOrder: number }[];
  paperQuestions: {
    paperId: string;
    questionId: string;
    sectionId?: string;
    sortOrder: number;
  }[];
};

