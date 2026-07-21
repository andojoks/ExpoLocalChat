import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QuestionBankAgent } from '../ai/agent';
import { MAX_AGENT_STEPS } from '../ai/graph';
import { HashEmbeddingProvider } from '../ai/embeddings/embedding';
import { SEED_QUESTIONS } from '../data/questions';
import type { ChatModel, GenerationOptions, TutorTurn } from '../ai/chat-model';
import type { ChatMessage } from '../domain/types';
import * as database from '../db/database';

jest.mock('../db/database', () => ({
  getQuestions: jest.fn(),
  getQuestion: jest.fn(),
  getEmbedding: jest.fn(),
  saveEmbedding: jest.fn(),
}));

const mocked = database as jest.Mocked<typeof database>;

class ScriptedModel implements ChatModel {
  readonly name = 'scripted';
  calls: { turns: TutorTurn[]; options?: GenerationOptions }[] = [];
  constructor(private outputs: string[]) {}
  async initialize() {}
  async generate(
    turns: TutorTurn[],
    onToken?: (token: string) => void,
    options?: GenerationOptions,
  ) {
    this.calls.push({ turns, options });
    const output = this.outputs.shift() || '';
    onToken?.(output);
    return output;
  }
}

describe('LangGraph-style agent loop smoke test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.getQuestions.mockResolvedValue(SEED_QUESTIONS);
    mocked.getQuestion.mockImplementation(async (_db: any, id: string) =>
      SEED_QUESTIONS.find((q) => q.id === id),
    );
    mocked.getEmbedding.mockResolvedValue(null);
    mocked.saveEmbedding.mockResolvedValue(undefined);
  });

  it('finishes without tools for ordinary conversation', async () => {
    const router = new ScriptedModel(['{"action":"finish","goal":"greet"}']);
    const chat = new ScriptedModel(['I am your local exam tutor.']);
    const agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat, router);
    const reply = await agent.invoke({ message: 'Who are you?', context: {} });
    expect(reply.content).toContain('local exam tutor');
    expect(reply.toolCalls).toHaveLength(0);
    expect(reply.agentDebug[0]?.action).toBe('finish');
    expect(mocked.getQuestions).not.toHaveBeenCalled();
    expect(router.calls).toHaveLength(1);
    expect(chat.calls).toHaveLength(1);
    expect(router.calls[0].options?.jsonSchema).toBeDefined();
  });

  it('forces a tool when the model finishes without evidence on an exam question', async () => {
    const router = new ScriptedModel(['{"action":"finish","goal":"skip"}']);
    const chat = new ScriptedModel(['Here are matching 2024 questions.']);
    const agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat, router);
    const reply = await agent.invoke({ message: 'Show all 2024 biology questions', context: {} });
    expect(reply.agentDebug.some((step) => step.action === 'forced_tool')).toBe(true);
    expect(reply.toolCalls.length).toBeGreaterThan(0);
    expect(mocked.getQuestions).toHaveBeenCalled();
  });

  it('inspects catalogue even when the model passes an unmatched subject label', async () => {
    const router = new ScriptedModel([
      '{"action":"tool","tool":"inspectCatalogue","arguments":{"subject":"not-a-real-subject-xyz"},"goal":"check"}',
      '{"action":"finish"}',
    ]);
    const chat = new ScriptedModel(['Here is the catalogue.']);
    const agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat, router);
    const reply = await agent.invoke({ message: 'what subjects are available?', context: {} });
    expect(reply.toolCalls[0].name).toBe('inspect_exam_catalogue');
    expect(reply.toolCalls[0].resultCount).toBeGreaterThan(0);
    expect(JSON.stringify(reply.toolCalls[0].preview)).toContain('subjects');
  });

  it('runs a tool then finishes and grounds the final answer', async () => {
    const router = new ScriptedModel([
      '{"action":"tool","tool":"listQuestions","arguments":{"year":2024,"page":1,"pageSize":2},"goal":"list 2024"}',
      '{"action":"finish","goal":"answer"}',
    ]);
    const chat = new ScriptedModel(['Page 1 of 3 - 5 total']);
    const agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat, router);
    const reply = await agent.invoke({ message: 'Show all 2024 questions', context: {} });
    expect(reply.toolCalls[0].name).toBe('list_exam_questions');
    expect(reply.toolCalls[0].resultCount).toBe(2);
    expect(reply.context.page).toBe(1);
    expect(chat.calls[0].turns.at(-1)?.content).toContain('"total":5');
    expect(chat.calls[0].turns.at(-1)?.content).toContain('Primary evidence');
    expect(reply.suggestions).toContain('Next page');
    expect(router.calls).toHaveLength(2);
    expect(chat.calls).toHaveLength(1);
  });

  it('chains multiple agent-chosen tools in one turn', async () => {
    const router = new ScriptedModel([
      '{"action":"tool","tool":"inspectCatalogue","arguments":{"year":2023},"goal":"see catalogue"}',
      '{"action":"tool","tool":"listQuestions","arguments":{"year":2023,"page":1,"pageSize":2},"goal":"list"}',
      '{"action":"finish"}',
    ]);
    const chat = new ScriptedModel(['Here is what I found for 2023.']);
    const agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat, router);
    const reply = await agent.invoke({ message: 'What 2023 questions exist?', context: {} });
    expect(reply.toolCalls).toHaveLength(2);
    expect(reply.toolCalls[0].name).toBe('inspect_exam_catalogue');
    expect(reply.toolCalls[1].name).toBe('list_exam_questions');
    expect(router.calls).toHaveLength(3);
    expect(chat.calls).toHaveLength(1);
  });

  it('resolves subject labels inside tools during an agent loop', async () => {
    const router = new ScriptedModel([
      '{"action":"tool","tool":"listQuestions","arguments":{"subject":"maths","year":2023},"goal":"list maths"}',
      '{"action":"finish"}',
    ]);
    const chat = new ScriptedModel(['I found matching mathematics records.']);
    const agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat, router);
    const reply = await agent.invoke({ message: 'maths 2023', context: {} });
    expect(reply.toolCalls[0].resultCount).toBe(2);
    expect(reply.context.subject).toBe('Mathematics');
  });

  it('uses EmbeddingGemma only inside semantic search', async () => {
    const embeddings = new HashEmbeddingProvider();
    const embedSpy = jest.spyOn(embeddings, 'embedQuery');
    const router = new ScriptedModel([
      '{"action":"tool","tool":"retrieveQuestions","arguments":{"query":"water through membrane","page":1,"pageSize":3}}',
      '{"action":"finish"}',
    ]);
    const chat = new ScriptedModel(['I found the stored osmosis question.']);
    const agent = new QuestionBankAgent({} as any, embeddings, chat, router);
    const reply = await agent.invoke({
      message: 'Find the question about water moving through a membrane',
      context: {},
    });
    expect(embedSpy).toHaveBeenCalledWith('water through membrane');
    expect(reply.toolCalls[0].name).toBe('search_exam_questions');
    expect(chat.calls[0].turns.at(-1)?.content).toContain('Primary evidence');
  });

  it('passes conversational history into every decide prompt', async () => {
    const history: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'Show 2024 biology questions', createdAt: 1 },
      {
        id: 'a1',
        role: 'assistant',
        content: 'I found osmosis and cell biology items on page 1.',
        createdAt: 2,
      },
    ];
    const router = new ScriptedModel([
      `{"action":"tool","tool":"getQuestionDetails","arguments":{"id":"${SEED_QUESTIONS[0].id}"},"goal":"explain"}`,
      '{"action":"finish"}',
    ]);
    const chat = new ScriptedModel(['Here is a full explanation of that question.']);
    const agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat, router);
    const reply = await agent.invoke({
      message: 'Explain that first one',
      context: { activeQuestionId: SEED_QUESTIONS[0].id },
      history: [
        ...history,
        { id: 'u2', role: 'user', content: 'Explain that first one', createdAt: 3 },
      ],
    });
    const decidePrompt = router.calls[0].turns.at(-1)?.content || '';
    expect(decidePrompt).toContain('Recent:');
    expect(decidePrompt).toContain('Show 2024 biology questions');
    expect(decidePrompt).toContain('Explain that first one');
    expect(decidePrompt).toContain('Tools so far:');
    expect(reply.toolCalls[0].name).toBe('get_question_details');
  });

  it('records an error observation for invalid tools then can finish', async () => {
    const router = new ScriptedModel([
      '{"action":"tool","tool":"notARealTool","arguments":{},"goal":"oops"}',
      '{"action":"finish"}',
    ]);
    const chat = new ScriptedModel(['Happy to help without that tool.']);
    const agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat, router);
    const reply = await agent.invoke({ message: 'Do something odd', context: {} });
    expect(reply.toolCalls).toHaveLength(0);
    expect(reply.content).toContain('Happy to help');
    expect(chat.calls[0].turns.at(-1)?.content).toContain('Tool notes:');
    expect(chat.calls[0].turns.at(-1)?.content).toContain('ERROR');
  });

  it('retries once when a decide step returns invalid JSON', async () => {
    const router = new ScriptedModel(['not-json-at-all', '{"action":"finish"}']);
    const chat = new ScriptedModel(['Recovered after a bad plan.']);
    const agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat, router);
    const reply = await agent.invoke({ message: 'Hello again', context: {} });
    expect(router.calls).toHaveLength(2);
    expect(router.calls[1].turns.some((turn) => turn.content.includes('valid JSON'))).toBe(true);
    expect(reply.content).toContain('Recovered');
    expect(chat.calls).toHaveLength(1);
  });

  it('stops after maxSteps and still synthesizes', async () => {
    const toolDecide =
      '{"action":"tool","tool":"inspectCatalogue","arguments":{"year":2023},"goal":"check"}';
    const router = new ScriptedModel(Array.from({ length: MAX_AGENT_STEPS }, () => toolDecide));
    const chat = new ScriptedModel(['Forced finish after max steps.']);
    const agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat, router);
    const reply = await agent.invoke({ message: 'is 2023 present?', context: {} });
    expect(router.calls).toHaveLength(MAX_AGENT_STEPS);
    expect(reply.toolCalls).toHaveLength(MAX_AGENT_STEPS);
    expect(chat.calls).toHaveLength(1);
    expect(reply.content).toContain('Forced finish');
  });

  it('emits plan/tool/answer phases during a tool turn', async () => {
    const phases: string[] = [];
    const router = new ScriptedModel([
      '{"action":"tool","tool":"inspectCatalogue","arguments":{"year":2023},"goal":"check"}',
      '{"action":"finish"}',
    ]);
    const chat = new ScriptedModel(['Catalogue checked.']);
    const agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat, router);
    await agent.invoke(
      { message: 'is 2023 present?', context: {} },
      { onPhase: (phase) => phases.push(phase) },
    );
    expect(phases).toEqual(['plan', 'tool', 'plan', 'answer']);
  });
});
