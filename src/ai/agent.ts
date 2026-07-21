import type { SQLiteDatabase } from 'expo-sqlite';
import type { AgentContext, AgentReply, ToolTrace } from '@/domain/types';
import type { EmbeddingProvider } from '@/ai/embeddings/embedding';
import type { ChatModel } from './chat-model';
import { createQuestionTools } from './tools';
type Input = { message: string; context: AgentContext; fullExplanation?: boolean };
type Plan = {
  mode: 'chat' | 'tool';
  tool?: 'listQuestions' | 'retrieveQuestions' | 'getQuestionDetails' | 'inspectCatalogue';
  arguments?: Record<string, unknown>;
  goal?: string;
};
const TOOL_ARGUMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: {
      type: 'string',
      enum: ['OL', 'AL'],
      description:
        'Use OL for Ordinary Level and AL for Advanced Level. Never output O Level, Ordinary Level, A Level, or Advanced Level.',
    },
    subject: { type: 'string' },
    topic: { type: 'string' },
    year: {
      type: 'integer',
      minimum: 1900,
      maximum: 2100,
      description: 'A number, never a string.',
    },
    paper: { type: 'integer', enum: [1, 2, 3], description: 'A number, never "paper 1".' },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 10 },
    query: { type: 'string' },
    id: { type: 'string' },
  },
};
const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mode'],
  properties: {
    mode: { type: 'string', enum: ['chat', 'tool'] },
    tool: {
      type: 'string',
      enum: ['listQuestions', 'retrieveQuestions', 'getQuestionDetails', 'inspectCatalogue'],
    },
    arguments: TOOL_ARGUMENT_SCHEMA,
    goal: { type: 'string' },
  },
};
const TOOL_GUIDE = `Available tools and exact argument contract:
1. listQuestions({category?,subject?,topic?,year?,paper?,page?,pageSize?}) for exhaustive filtered listing.
2. retrieveQuestions({query,category?,subject?,topic?,year?,paper?,page?,pageSize?}) for semantic search.
3. getQuestionDetails({id}) for one exact stored question.
4. inspectCatalogue({category?,subject?,year?}) for availability and counts.

Output JSON only. For normal conversation output exactly {"mode":"chat"}.

Use exact tool values:
- category MUST be "OL" or "AL" only. Convert "O Level", "Ordinary Level", and "ordinary" to "OL". Convert "A Level", "Advanced Level", and "advanced" to "AL".
- year MUST be a number, e.g. 2023, never "2023".
- paper MUST be a number 1, 2, or 3, never "Paper 1".
- page and pageSize MUST be numbers.

Examples:
Student: is o level math 2023 present?
{"mode":"tool","tool":"inspectCatalogue","arguments":{"category":"OL","subject":"Mathematics","year":2023},"goal":"check whether O Level Mathematics 2023 exists"}
Student: show advanced level physics paper 2 from 2024
{"mode":"tool","tool":"listQuestions","arguments":{"category":"AL","subject":"Physics","year":2024,"paper":2,"page":1,"pageSize":5},"goal":"list the requested paper questions"}
Student: hello
{"mode":"chat"}

Never call a tool for greetings, identity, study advice, or casual conversation. Use listQuestions for all questions in a paper/year/topic and pagination. Use retrieveQuestions for concepts or partial wording. Preserve filters and increment page for next-page requests.`;
const NUMBER_KEYS = new Set(['year', 'paper', 'page', 'pageSize']);
export class QuestionBankAgent {
  private tools;
  constructor(
    db: SQLiteDatabase,
    embeddings: EmbeddingProvider,
    private chat: ChatModel,
    private router: ChatModel = chat,
  ) {
    this.tools = createQuestionTools(db, embeddings);
  }
  async invoke(input: Input, onToken?: (token: string) => void): Promise<AgentReply> {
    const plan = await this.plan(input),
      traces: ToolTrace[] = [];
    if (plan.mode === 'chat') return this.chatReply(input, traces, onToken);
    const key = plan.tool && plan.tool in this.tools ? plan.tool : undefined;
    if (!key) return this.chatReply(input, traces, onToken);
    const selected: any = this.tools[key],
      args = normalizeToolArguments(key, { ...(plan.arguments || {}) }, input.context);
    const value = await selected.invoke(args);
    traces.push({
      name: selected.name,
      input: args,
      resultCount: Array.isArray(value)
        ? value.length
        : Array.isArray(value?.items)
          ? value.items.length
          : value?.count,
    });
    const context = this.nextContext(input.context, key, args, value);
    const generated = await this.chat.generate(
      [
        {
          role: 'system',
          content: `You are QuestionBank Tutor, an expert Cameroon GCE tutor. The tool output below is the only authority for exam questions, answers, solutions, availability, counts, years, papers, and topics. Never invent or alter those facts. Respond naturally to the student's actual request. For a list, show every item in the returned page with question number, source, topic, and question text; state "Page X of Y - N total" and offer next/previous navigation. For an explanation, teach step by step using the stored answer and solution, preserving Markdown and LaTeX. If the tool found nothing, say so plainly and suggest broader filters. Do not mention internal routing or claim a strong match.`,
        },
        {
          role: 'user',
          content: `STUDENT: ${input.message}\nGOAL: ${plan.goal || 'Answer the request'}\nTOOL: ${selected.name}\nTOOL OUTPUT:\n${JSON.stringify(value)}`,
        },
      ],
      onToken,
    );
    const content = generated.trim() || groundedFallback(value);
    return { content, context, toolCalls: traces, suggestions: this.suggestions(value) };
  }
  private async plan(input: Input): Promise<Plan> {
    const raw = await this.router.generate(
      [
        {
          role: 'system',
          content: `You are the private tool-routing model for a local exam tutor. ${TOOL_GUIDE}`,
        },
        {
          role: 'user',
          content: `Conversation state: ${JSON.stringify(input.context)}\nStudent message: ${input.message}`,
        },
      ],
      undefined,
      { jsonSchema: PLAN_SCHEMA, maxTokens: 220, temperature: 0 },
    );
    try {
      const start = raw.indexOf('{'),
        end = raw.lastIndexOf('}');
      if (start < 0 || end < start) return { mode: 'chat' };
      const plan = JSON.parse(raw.slice(start, end + 1));
      return plan?.mode === 'tool' ? plan : { mode: 'chat' };
    } catch {
      return { mode: 'chat' };
    }
  }
  private async chatReply(
    input: Input,
    traces: ToolTrace[],
    onToken?: (token: string) => void,
  ): Promise<AgentReply> {
    const generated = await this.chat.generate(
      [
        {
          role: 'system',
          content:
            'You are QuestionBank Tutor, a warm, concise, expert study companion. Converse naturally. Explain your role and study methods freely, but never invent database contents or past-exam facts. When the student asks for exam-specific material, encourage a precise subject, year, paper, or topic request.',
        },
        { role: 'user', content: input.message },
      ],
      onToken,
    );
    const content = generated.trim() || casualFallback(input.message);
    return {
      content,
      context: input.context,
      toolCalls: traces,
      suggestions: ['Browse a paper', 'Find a topic', 'Help me revise'],
    };
  }
  private nextContext(
    current: AgentContext,
    key: string,
    args: Record<string, unknown>,
    value: any,
  ): AgentContext {
    const first = value?.items?.[0] || value;
    return {
      ...current,
      category: (args.category || first?.category || current.category) as any,
      subject: (args.subject || first?.subject || current.subject) as any,
      topic: (args.topic || first?.topic || current.topic) as any,
      year: (args.year || first?.year || current.year) as any,
      activeQuestionId: first?.id || current.activeQuestionId,
      page: Number(value?.page || args.page || 1),
      pageSize: Number(value?.pageSize || args.pageSize || 5),
      lastTool: key,
      lastArguments: args,
    };
  }
  private suggestions(value: any) {
    const out: string[] = [];
    if (value?.page > 1) out.push('Previous page');
    if (value?.page < value?.totalPages) out.push('Next page');
    out.push('Explain one of these', 'Change the filters');
    return out;
  }
}
export function normalizeToolArguments(
  toolName: string,
  args: Record<string, unknown>,
  context: AgentContext = {},
) {
  const out: { [key: string]: unknown } = { ...args };
  for (const key of NUMBER_KEYS) {
    const value = out[key];
    if (typeof value === 'string') {
      const match = value.match(/\d+/);
      if (match) out[key] = Number(match[0]);
    }
  }
  if (typeof out.category === 'string') {
    const category = normalizeCategory(out.category);
    if (category) out.category = category;
  }
  if (toolName !== 'getQuestionDetails') {
    if (out.page === undefined) out.page = context.page && isPageTurn(args) ? context.page : 1;
    if (out.pageSize === undefined) out.pageSize = context.pageSize || 5;
  }
  if (toolName === 'retrieveQuestions' && typeof out.query !== 'string') out.query = '';
  return out;
}
function normalizeCategory(value: string) {
  const text = value.toLowerCase().replace(/[^a-z]/g, '');
  if (['ol', 'ordinary', 'ordinarylevel', 'olevel', 'gceordinarylevel'].includes(text)) return 'OL';
  if (['al', 'advanced', 'advancedlevel', 'alevel', 'gceadvancedlevel'].includes(text)) return 'AL';
  return undefined;
}
function isPageTurn(args: Record<string, unknown>) {
  return args.page !== undefined || args.pageSize !== undefined;
}
function casualFallback(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes('who are you') || lower.includes('what do you do'))
    return 'I am QuestionBank AI, your local Cameroon GCE study tutor. I can search the question database, list papers by year/topic, pull up specific questions, and explain answers step by step without inventing past-exam facts.';
  return 'I am here. Ask me for a subject, year, paper, topic, or a question number, and I will use the local question bank to help you study.';
}
function groundedFallback(value: any) {
  if (Array.isArray(value?.items) && value.items.length) {
    const lines = value.items.map(
      (q: any, index: number) =>
        `${index + 1}. **${q.subject} ${q.year} Paper ${q.paper}, Q${q.number}** - ${q.topic}\n\n${q.question}`,
    );
    return `I found ${value.total ?? value.items.length} matching question${(value.total ?? value.items.length) === 1 ? '' : 's'}.\n\n${lines.join('\n\n')}\n\nPage ${value.page ?? 1} of ${value.totalPages ?? 1}.`;
  }
  if (value?.question)
    return `Here is the stored question:\n\n**${value.subject} ${value.year} Paper ${value.paper}, Q${value.number}** - ${value.topic}\n\n${value.question}\n\n**Answer:** ${value.answer}\n\n${value.solution ?? ''}`.trim();
  return 'I could not find a matching record in the local question bank. Try widening the year, paper, subject, or topic.';
}
