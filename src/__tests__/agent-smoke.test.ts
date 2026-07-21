import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { QuestionBankAgent, normalizeToolArguments } from '../ai/agent';
import { HashEmbeddingProvider } from '../ai/embeddings/embedding';
import { SEED_QUESTIONS } from '../data/questions';
import type { ChatModel, GenerationOptions, TutorTurn } from '../ai/chat-model';
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
describe('model-routed tutor smoke test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.getQuestions.mockResolvedValue(SEED_QUESTIONS);
    mocked.getQuestion.mockImplementation(async (_db: any, id: string) =>
      SEED_QUESTIONS.find((q) => q.id === id),
    );
    mocked.getEmbedding.mockResolvedValue(null);
    mocked.saveEmbedding.mockResolvedValue(undefined);
  });
  it('keeps ordinary conversation out of database tools', async () => {
    const router = new ScriptedModel(['{"mode":"chat"}']),
      chat = new ScriptedModel(['I am your local exam tutor.']),
      agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat, router);
    const reply = await agent.invoke({ message: 'Who are you?', context: {} });
    expect(reply.content).toContain('local exam tutor');
    expect(reply.toolCalls).toHaveLength(0);
    expect(mocked.getQuestions).not.toHaveBeenCalled();
    expect(router.calls[0].options?.jsonSchema).toBeDefined();
  });
  it('lists a filtered year with pagination and grounds the final prompt', async () => {
    const router = new ScriptedModel([
        '{"mode":"tool","tool":"listQuestions","arguments":{"year":2024,"page":1,"pageSize":2},"goal":"list 2024 questions"}',
      ]),
      chat = new ScriptedModel(['Page 1 of 3 - 5 total']),
      agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat, router);
    const reply = await agent.invoke({ message: 'Show all 2024 questions', context: {} });
    expect(reply.toolCalls[0].name).toBe('list_exam_questions');
    expect(reply.toolCalls[0].resultCount).toBe(2);
    expect(reply.context.page).toBe(1);
    expect(reply.context.pageSize).toBe(2);
    expect(chat.calls[0].turns.at(-1)?.content).toContain('"total":5');
    expect(reply.suggestions).toContain('Next page');
  });
  it('normalizes loose model-planned category and numeric arguments', async () => {
    const router = new ScriptedModel([
        '{"mode":"tool","tool":"inspectCatalogue","arguments":{"category":"O Level","year":"2023"},"goal":"check availability"}',
      ]),
      chat = new ScriptedModel(['Yes, I can check that catalogue slice.']),
      agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat, router);
    const reply = await agent.invoke({ message: 'is o level math 2023 present?', context: {} });
    expect(reply.toolCalls[0].input).toMatchObject({ category: 'OL', year: 2023 });
    expect(mocked.getQuestions).toHaveBeenCalled();
  });
  it('does not crash when a synced question row is missing subject or topic', async () => {
    mocked.getQuestions.mockResolvedValue([
      { ...SEED_QUESTIONS[0], subject: undefined as any, topic: undefined as any },
    ]);
    const router = new ScriptedModel([
        '{"mode":"tool","tool":"listQuestions","arguments":{"subject":"Mathematics","year":2023},"goal":"list math"}',
      ]),
      chat = new ScriptedModel(['No matching records.']),
      agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat, router);
    const reply = await agent.invoke({ message: 'math 2023', context: {} });
    expect(reply.toolCalls[0].name).toBe('list_exam_questions');
    expect(reply.toolCalls[0].resultCount).toBe(0);
  });
  it('uses EmbeddingGemma only inside semantic search', async () => {
    const embeddings = new HashEmbeddingProvider(),
      embedSpy = jest.spyOn(embeddings, 'embedQuery'),
      router = new ScriptedModel([
        '{"mode":"tool","tool":"retrieveQuestions","arguments":{"query":"water through membrane","page":1,"pageSize":3}}',
      ]),
      chat = new ScriptedModel(['I found the stored osmosis question.']),
      agent = new QuestionBankAgent({} as any, embeddings, chat, router);
    const reply = await agent.invoke({
      message: 'Find the question about water moving through a membrane',
      context: {},
    });
    expect(embedSpy).toHaveBeenCalledWith('water through membrane');
    expect(reply.toolCalls[0].name).toBe('search_exam_questions');
    expect(chat.calls[0].turns.at(-1)?.content).toContain('TOOL OUTPUT');
  });
});
describe('tool argument normalization', () => {
  it('coerces learner/planner phrasing into strict tool args', () => {
    expect(
      normalizeToolArguments('listQuestions', {
        category: 'advanced level',
        year: '2024',
        paper: 'paper 2',
        pageSize: '10',
      }),
    ).toMatchObject({ category: 'AL', year: 2024, paper: 2, pageSize: 10, page: 1 });
  });
});
