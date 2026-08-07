import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QuestionBankAgent, MAX_AGENT_RECURSION, TutorRuntime } from '../ai/agent';
import { HashEmbeddingProvider } from '../ai/embeddings/embedding';
import { SEED_QUESTIONS } from './fixtures/exam-bank-fixture';
import type { ChatModel, GenerationOptions, TutorTurn } from '../ai/chat-model';
import { createHttpChatModel } from '../ai/models/http-chat-model';
import { fillSlots } from '../ai/runtime/slots';
import { resolveIntent } from '../ai/runtime/intent-gate';
import * as database from '../db/database';

type RunState = { runs: Map<string, any>; steps: Map<string, any[]> };
function runState(): RunState {
  const g = globalThis as any;
  if (!g.__tutorRunState) {
    g.__tutorRunState = { runs: new Map(), steps: new Map() };
  }
  return g.__tutorRunState;
}

jest.mock('../db/database', () => {
  const { SEED_BANK: mockSeedBank } = require('./fixtures/exam-bank-fixture');
  const { normalizeCategoryCode } = jest.requireActual('../db/exam-bank') as typeof import('../db/exam-bank');
  const getState = () => {
    const g = globalThis as any;
    if (!g.__tutorRunState) g.__tutorRunState = { runs: new Map(), steps: new Map() };
    return g.__tutorRunState as { runs: Map<string, any>; steps: Map<string, any[]> };
  };
  return {
  getQuestions: jest.fn(),
  getQuestion: jest.fn(),
  getEmbedding: jest.fn(),
  saveEmbedding: jest.fn(),
    listCategories: jest.fn(async () =>
      mockSeedBank.categories.map((c: any) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        descriptionMd: c.descriptionMd,
      })),
    ),
    listSubjects: jest.fn(async () => mockSeedBank.subjects),
    listPaperYears: jest.fn(async (_db: any, filter: any = {}) => {
      let papers = mockSeedBank.papers as any[];
      if (filter.subjectCode) {
        papers = papers.filter((p) => {
          const s = mockSeedBank.subjects.find((item: any) => item.id === p.subjectId);
          return s?.code === String(filter.subjectCode).toUpperCase();
        });
      }
      if (filter.subjectName) {
        const needle = String(filter.subjectName).toLowerCase();
        papers = papers.filter((p) => {
          const s = mockSeedBank.subjects.find((item: any) => item.id === p.subjectId);
          return String(s?.name || '')
            .toLowerCase()
            .includes(needle);
        });
      }
      if (filter.categoryCode) {
        const code = String(filter.categoryCode).toUpperCase();
        papers = papers.filter((p) => {
          const s = mockSeedBank.subjects.find((item: any) => item.id === p.subjectId);
          const c = mockSeedBank.categories.find((cat: any) => cat.id === s?.categoryId);
          return c?.code === code;
        });
      }
      return [...new Set(papers.map((p: any) => p.year))].sort();
    }),
    listTopics: jest.fn(async () => [
      ...new Set(mockSeedBank.questions.map((q: any) => q.topic).filter(Boolean)),
    ]),
    listPapers: jest.fn(async () =>
      mockSeedBank.papers.map((p: any) => ({
        ...p,
        subjectName: mockSeedBank.subjects.find((s: any) => s.id === p.subjectId)?.name,
        categoryCode: mockSeedBank.categories.find(
          (c: any) =>
            c.id === mockSeedBank.subjects.find((s: any) => s.id === p.subjectId)?.categoryId,
        )?.code,
      })),
    ),
    listSectionsForPaper: jest.fn(async (_db: any, paperId: string) =>
      mockSeedBank.paperSections
        .filter((row: any) => row.paperId === paperId)
        .map((row: any) => {
          const section = mockSeedBank.sections.find((s: any) => s.id === row.sectionId)!;
          return { ...section, sortOrder: row.sortOrder };
        }),
    ),
    listQuestionsForPaper: jest.fn(async (_db: any, filter: any) => {
      let links = mockSeedBank.paperQuestions.filter((row: any) => {
        const q = mockSeedBank.questions.find((item: any) => item.id === row.questionId);
        return q && !q.parentQuestionId;
      });
      if (filter.year) {
        links = links.filter((row: any) => {
          const paper = mockSeedBank.papers.find((p: any) => p.id === row.paperId);
          return paper?.year === filter.year;
        });
      }
      if (filter.subjectName) {
        const needle = String(filter.subjectName).toLowerCase();
        links = links.filter((row: any) => {
          const paper = mockSeedBank.papers.find((p: any) => p.id === row.paperId);
          const subject = mockSeedBank.subjects.find((s: any) => s.id === paper?.subjectId);
          return String(subject?.name || '')
            .toLowerCase()
            .includes(needle);
        });
      }
      if (filter.subjectCode) {
        links = links.filter((row: any) => {
          const paper = mockSeedBank.papers.find((p: any) => p.id === row.paperId);
          const subject = mockSeedBank.subjects.find((s: any) => s.id === paper?.subjectId);
          return subject?.code === String(filter.subjectCode).toUpperCase();
        });
      }
      if (filter.topic) {
        const needle = String(filter.topic).toLowerCase();
        links = links.filter((row: any) => {
          const q = mockSeedBank.questions.find((item: any) => item.id === row.questionId);
          return String(q?.topic || '')
            .toLowerCase()
            .includes(needle);
        });
      }
      const items = links.map((row: any) => {
        const q = mockSeedBank.questions.find((item: any) => item.id === row.questionId)!;
        const paper = mockSeedBank.papers.find((p: any) => p.id === row.paperId);
        const subject = mockSeedBank.subjects.find((s: any) => s.id === paper?.subjectId);
        return {
          id: q.id,
          numberLabel: q.numberLabel,
          topic: q.topic,
          marks: q.marks,
          stem: q.promptMd.slice(0, 80),
          subjectName: subject?.name,
          year: paper?.year,
          paperNumber: paper?.paperNumber,
          paperId: paper?.id,
        };
      });
      return {
        items,
        total: items.length,
        page: 1,
        pageSize: 5,
        totalPages: 1,
      };
    }),
    getQuestionTree: jest.fn(async (_db: any, id: string) => {
      const q = mockSeedBank.questions.find((item: any) => item.id === id);
      if (!q) return null;
      const children = mockSeedBank.questions
        .filter((item: any) => item.parentQuestionId === id)
        .map((child: any) => ({ ...child, children: undefined }));
      return { ...q, children: children.length ? children : undefined };
    }),
    searchEntitiesByEmbedding: jest.fn(async () => [
      {
        level: 'question',
        id: 'ol-bio-2024-p1-q8',
        score: 0.9,
        label: 'Biology Q8',
        snippet: 'Define osmosis',
      },
    ]),
    keywordSearchExamBank: jest.fn(async () => []),
    reindexEntityEmbeddings: jest.fn(),
    normalizeCategoryCode,
    listMessageEmbeddings: jest.fn(async () => []),
    saveMessageEmbedding: jest.fn(),
    listKgNodes: jest.fn(async () => []),
    listKgEdges: jest.fn(async () => []),
    listKgNeighbors: jest.fn(async () => ({ nodes: [], edges: [] })),
    upsertKgNode: jest.fn(),
    upsertKgEdge: jest.fn(),
    createAgentRun: jest.fn(async (_db: any, run: any) => {
      const { runs, steps } = getState();
      const row = {
        id: run.id,
        conversationId: run.conversationId,
        status: run.status || 'running',
        intent: run.intent,
        slots: run.slots || {},
        activeQuestionId: run.activeQuestionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      runs.set(run.id, row);
      steps.set(run.id, []);
      return row;
    }),
    updateAgentRun: jest.fn(async (_db: any, id: string, patch: any) => {
      const { runs } = getState();
      const current = runs.get(id);
      if (!current) return null;
      const next = {
        ...current,
        ...patch,
        slots: patch.slots ?? current.slots,
        updatedAt: Date.now(),
      };
      if (patch.error === null) next.error = undefined;
      if (patch.activeQuestionId === null) next.activeQuestionId = undefined;
      runs.set(id, next);
      return next;
    }),
    getAgentRun: jest.fn(async (_db: any, id: string) => getState().runs.get(id) || null),
    getOpenAgentRun: jest.fn(async (_db: any, conversationId: string) => {
      const open = [...getState().runs.values()]
        .filter(
          (r) =>
            r.conversationId === conversationId &&
            ['awaiting_user', 'failed', 'running', 'ready_to_answer'].includes(r.status),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      return open || null;
    }),
    appendAgentStep: jest.fn(async (_db: any, step: any) => {
      const { steps } = getState();
      const list = steps.get(step.runId) || [];
      list.push({ ...step, payload: step.payload || {}, createdAt: Date.now() });
      steps.set(step.runId, list);
    }),
    listAgentSteps: jest.fn(async (_db: any, runId: string) => getState().steps.get(runId) || []),
  };
});

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

describe('Deterministic TutorRuntime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const state = runState();
    state.runs.clear();
    state.steps.clear();
    mocked.getQuestions.mockResolvedValue(SEED_QUESTIONS);
    mocked.getQuestion.mockImplementation(async (_db: any, id: string) =>
      SEED_QUESTIONS.find((q) => q.id === id),
    );
    mocked.getEmbedding.mockResolvedValue(null);
    mocked.saveEmbedding.mockResolvedValue(undefined);
    mocked.listMessageEmbeddings.mockResolvedValue([]);
    mocked.listKgNeighbors.mockResolvedValue({ nodes: [], edges: [] });
    mocked.listKgNodes.mockResolvedValue([]);
  });

  it('finishes without tools for chitchat and streams an answer', async () => {
    const chat = new ScriptedModel(['unused — greeting is canned']);
    const agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat);
    const reply = await agent.invoke(
      { message: 'Who are you?', context: {} },
      { threadId: 't-greet' },
    );
    expect(reply.content.toLowerCase()).toMatch(/tutor|gce|question bank/);
    expect(reply.toolCalls).toHaveLength(0);
    expect(reply.agentDebug.some((step) => step.note?.includes('chitchat'))).toBe(true);
    expect(chat.calls).toHaveLength(0);
  });

  it('lists exam categories for catalogue intent', async () => {
    const chat = new ScriptedModel(['unused — catalogue is deterministic']);
    const agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat);
    const reply = await agent.invoke(
      { message: 'what subjects are available?', context: {} },
      { threadId: 't-cat' },
    );
    expect(reply.toolCalls.some((t) => t.name === 'list_exam_categories')).toBe(true);
    expect(reply.toolCalls.some((t) => t.name === 'list_subjects')).toBe(true);
    expect(reply.content.toLowerCase()).toMatch(/subject|catalogue|gce/);
    expect(reply.content).toMatch(/Mathematics|Biology|Physics/);
    expect(reply.status).toBe('completed');
    expect(chat.calls).toHaveLength(0);
  });

  it('lists 2024 questions without asking the model to choose tools', async () => {
    const chat = new ScriptedModel(['unused — list is deterministic']);
    const agent = new QuestionBankAgent({} as any, new HashEmbeddingProvider(), chat);
    const reply = await agent.invoke(
      { message: 'Show all 2024 questions', context: {} },
      { threadId: 't-list' },
    );
    expect(reply.toolCalls.some((t) => t.name === 'list_exam_questions')).toBe(true);
    expect(reply.content).toContain('2024');
    expect(reply.suggestions.length).toBeGreaterThan(0);
    expect(chat.calls).toHaveLength(0);
  });

  it('pauses for a clarifying follow-up then resumes from checkpoint', async () => {
    const chat = new ScriptedModel([
      'Which subject do you need?',
      'Here are the matching questions.',
    ]);
    const runtime = new TutorRuntime({} as any, new HashEmbeddingProvider(), chat);
    const first = await runtime.startTurn({
      message: 'list questions',
      conversationId: 'c-resume',
      context: {},
    });
    expect(first.status).toBe('awaiting_user');
    expect(first.content.toLowerCase()).toContain('subject');

    const second = await runtime.resumeTurn(
      first.runId,
      'Biology 2024',
      {
        onToken: undefined,
      },
      { conversationId: 'c-resume', context: {} },
    );
    expect(second.status).toBe('completed');
    expect(second.toolCalls.some((t) => t.name === 'list_exam_questions')).toBe(true);
  });

  it('fills GCE slots from natural language via catalogue snapshot', () => {
    const {
      deriveCategoryAliases,
    } = require('../ai/runtime/catalogue-snapshot') as typeof import('../ai/runtime/catalogue-snapshot');
    const snapshot = {
      categories: [
        {
          code: 'GCE_OL',
          name: 'GCE Ordinary Level',
          aliases: deriveCategoryAliases('GCE_OL', 'GCE Ordinary Level'),
        },
      ],
      subjects: [{ id: 'sub-ol-bio', code: 'BIO', name: 'Biology', categoryCode: 'GCE_OL' }],
      years: [2023, 2024],
      topics: ['Cell Biology'],
    };
    const slots = fillSlots('Show OL Biology paper 2 from 2024', {}, {}, snapshot);
    expect(slots.category).toBe('GCE_OL');
    expect(slots.subject).toBe('Biology');
    expect(slots.subjectCode).toBe('BIO');
    expect(slots.year).toBe(2024);
    expect(slots.paper).toBe(2);
  });

  it('resolves catalogue intent without embeddings when keywords match', async () => {
    const intent = await resolveIntent(
      'which subjects are available?',
      {},
      new HashEmbeddingProvider(),
    );
    expect(intent).toBe('catalogue');
  });

  it('lists years via list_exam_years for coverage asks', async () => {
    const chat = new ScriptedModel(['unused']);
    const runtime = new TutorRuntime({} as any, new HashEmbeddingProvider(), chat);
    const reply = await runtime.startTurn({
      message: 'what years are available?',
      conversationId: 'c-years',
      context: {},
    });
    expect(reply.status).toBe('completed');
    expect(reply.toolCalls.some((t) => t.name === 'list_exam_years')).toBe(true);
    expect(reply.content).toMatch(/2023|2024/);
  });

  it('filters years by subject', async () => {
    const chat = new ScriptedModel(['unused']);
    const runtime = new TutorRuntime({} as any, new HashEmbeddingProvider(), chat);
    const reply = await runtime.startTurn({
      message: 'Years for Biology',
      conversationId: 'c-years-bio',
      context: {},
    });
    expect(reply.toolCalls.some((t) => t.name === 'list_exam_years')).toBe(true);
    const call = reply.toolCalls.find((t) => t.name === 'list_exam_years');
    expect(call?.input).toEqual(
      expect.objectContaining({ subject: 'Biology', subjectCode: 'BIO' }),
    );
    expect(reply.content).toContain('2024');
  });

  it('lists topic questions across years without requiring a year', async () => {
    const chat = new ScriptedModel(['unused']);
    const runtime = new TutorRuntime({} as any, new HashEmbeddingProvider(), chat);
    const reply = await runtime.startTurn({
      message: 'Algebra',
      conversationId: 'c-topic',
      context: {},
    });
    expect(reply.status).toBe('completed');
    const listCall = reply.toolCalls.find((t) => t.name === 'list_exam_questions');
    expect(listCall).toBeTruthy();
    expect(listCall?.input).toEqual(expect.objectContaining({ topic: 'Algebra' }));
    expect(listCall?.input.year).toBeUndefined();
  });

  it('shows papers for a bare subject without listing questions', async () => {
    const chat = new ScriptedModel(['unused']);
    const runtime = new TutorRuntime({} as any, new HashEmbeddingProvider(), chat);
    const reply = await runtime.startTurn({
      message: 'Physics',
      conversationId: 'c-bare-phys',
      context: {},
    });
    expect(reply.toolCalls.some((t) => t.name === 'list_papers')).toBe(true);
    expect(reply.toolCalls.some((t) => t.name === 'list_exam_questions')).toBe(false);
    expect(reply.content.toLowerCase()).toMatch(/paper/);
    expect(reply.content.toLowerCase()).toContain('list questions');
  });

  it('lists questions when the user asks explicitly after a subject', async () => {
    const chat = new ScriptedModel(['unused']);
    const runtime = new TutorRuntime({} as any, new HashEmbeddingProvider(), chat);
    const reply = await runtime.startTurn({
      message: 'list Physics questions',
      conversationId: 'c-phys-qs',
      context: {},
    });
    expect(reply.toolCalls.some((t) => t.name === 'list_exam_questions')).toBe(true);
  });

  it('does not coerce search about osmosis to list with sticky Biology', async () => {
    const chat = new ScriptedModel(['unused']);
    const runtime = new TutorRuntime({} as any, new HashEmbeddingProvider(), chat);
    const reply = await runtime.startTurn({
      message: 'search about osmosis',
      conversationId: 'c-search',
      context: { subject: 'Biology', year: 2024 },
    });
    expect(reply.toolCalls.some((t) => t.name === 'search_exam_bank')).toBe(true);
    expect(reply.toolCalls.some((t) => t.name === 'list_exam_questions')).toBe(false);
    const search = reply.toolCalls.find((t) => t.name === 'search_exam_bank');
    expect(search?.input.year).toBeUndefined();
    expect(search?.input.subject).toBeUndefined();
  });

  it('plans list_sections when lastPaperId is set', async () => {
    const chat = new ScriptedModel(['unused']);
    const runtime = new TutorRuntime({} as any, new HashEmbeddingProvider(), chat);
    const reply = await runtime.startTurn({
      message: 'what sections are in this paper?',
      conversationId: 'c-sections',
      context: { lastPaperId: 'paper-ol-math-2024-p2', subject: 'Mathematics' },
    });
    expect(reply.toolCalls.some((t) => t.name === 'list_sections')).toBe(true);
    const call = reply.toolCalls.find((t) => t.name === 'list_sections');
    expect(call?.input).toEqual({ paperId: 'paper-ol-math-2024-p2' });
  });

  it('HttpChatModel posts to OpenAI-compatible completions', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hello from http' } }],
      }),
    }));
    (globalThis as any).fetch = fetchMock;
    const model = createHttpChatModel({
      baseUrl: 'https://example.test/v1',
      apiKey: 'sk-test',
      model: 'gpt-test',
    });
    const text = await model.generate([{ role: 'user', content: 'hi' }]);
    expect(text).toBe('hello from http');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('exports a recursion/safety constant', () => {
    expect(MAX_AGENT_RECURSION).toBeGreaterThanOrEqual(4);
  });
});
