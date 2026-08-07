import { describe, expect, it } from '@jest/globals';
import {
  deriveCategoryAliases,
  matchCategory,
  type CatalogueSnapshot,
} from '../ai/runtime/catalogue-snapshot';
import { coerceIntentFromSlots, isYearCoverageAsk, resolveIntent } from '../ai/runtime/intent-gate';
import { fillSlots } from '../ai/runtime/slots';
import { renderToolReply } from '../ai/runtime/facts';
import { HashEmbeddingProvider } from '../ai/embeddings/embedding';

const BANK: CatalogueSnapshot = {
  categories: [
    {
      code: 'GCE_OL',
      name: 'GCE Ordinary Level',
      aliases: deriveCategoryAliases('GCE_OL', 'GCE Ordinary Level'),
    },
    {
      code: 'GCE_AL',
      name: 'GCE Advanced Level',
      aliases: deriveCategoryAliases('GCE_AL', 'GCE Advanced Level'),
    },
  ],
  subjects: [
    { id: 'sub-ol-bio', code: 'BIO', name: 'Biology', categoryCode: 'GCE_OL' },
    { id: 'sub-ol-phys', code: 'PHYS', name: 'Physics', categoryCode: 'GCE_OL' },
  ],
  years: [2023, 2024],
  topics: ['Cell Biology', 'Algebra', 'Osmosis'],
};

describe('browse facet gaps', () => {
  it('detects year-coverage language', () => {
    expect(isYearCoverageAsk('what years are available?')).toBe(true);
    expect(isYearCoverageAsk('Years for Biology')).toBe(true);
    expect(isYearCoverageAsk('list Biology 2024')).toBe(false);
  });

  it('routes year coverage to catalogue even with a subject', async () => {
    const intent = await resolveIntent(
      'Years for Biology',
      {},
      new HashEmbeddingProvider(),
      BANK,
    );
    expect(intent).toBe('catalogue');
  });

  it('keeps search when search verbs are present despite sticky subject', () => {
    const slots = fillSlots(
      'search about osmosis',
      { subject: 'Biology', subjectCode: 'BIO', year: 2024 },
      {},
      BANK,
    );
    expect(coerceIntentFromSlots('search', slots, 'search about osmosis')).toBe('search');
  });

  it('clears sticky year and paper when the subject changes', () => {
    const slots = fillSlots(
      'Physics',
      { subject: 'Biology', subjectCode: 'BIO', year: 2024, paper: 1 },
      {},
      BANK,
    );
    expect(slots.subject).toBe('Physics');
    expect(slots.year).toBeUndefined();
    expect(slots.paper).toBeUndefined();
  });

  it('clears sticky year when subject changes via AgentContext only', () => {
    const slots = fillSlots(
      'Physics',
      {},
      { subject: 'Biology', year: 2024, activeQuestionId: 'ol-bio-2024-p1-q8' },
      BANK,
    );
    expect(slots.subject).toBe('Physics');
    expect(slots.year).toBeUndefined();
    expect(slots.activeQuestionId).toBeUndefined();
  });

  it('lists a bare topic without sticky subject/year', () => {
    const slots = fillSlots(
      'Algebra',
      {},
      { subject: 'Physics', year: 2024 },
      BANK,
    );
    expect(slots.topic).toBe('Algebra');
    expect(slots.subject).toBeUndefined();
    expect(slots.year).toBeUndefined();
    expect(slots.category).toBeUndefined();
  });

  it('does not treat Algebra as the AL category alias', () => {
    expect(matchCategory('Algebra', BANK)).toBeUndefined();
    expect(matchCategory('AL Mathematics', BANK)?.code).toBe('GCE_AL');
  });

  it('drops sticky topic when a subject is named without a topic', () => {
    const slots = fillSlots(
      'Biology 2024',
      {},
      { topic: 'Algebra', year: 2023 },
      BANK,
    );
    expect(slots.subject).toBe('Biology');
    expect(slots.topic).toBeUndefined();
    expect(slots.year).toBe(2024);
  });

  it('clears foreign paper/question stickiness when a subject is named', () => {
    const slots = fillSlots(
      'Biology 2024',
      {},
      {
        lastPaperId: 'paper-ol-phys-2023-p2',
        activeQuestionId: 'ol-phys-2023-p2-q5',
      },
      BANK,
    );
    expect(slots.subject).toBe('Biology');
    expect(slots.year).toBe(2024);
    expect(slots.lastPaperId).toBeUndefined();
    expect(slots.activeQuestionId).toBeUndefined();
  });

  it('search clears sticky paper and active question', () => {
    const slots = fillSlots(
      'search about osmosis',
      {},
      {
        subject: 'Physics',
        lastPaperId: 'paper-ol-phys-2023-p2',
        activeQuestionId: 'ol-phys-2023-p2-q5',
      },
      BANK,
    );
    expect(slots.lastPaperId).toBeUndefined();
    expect(slots.activeQuestionId).toBeUndefined();
  });

  it('bare list questions drops sticky year and topic but keeps subject', () => {
    const slots = fillSlots(
      'list questions',
      {},
      { subject: 'Biology', topic: 'Algebra', year: 2024 },
      BANK,
    );
    expect(slots.subject).toBe('Biology');
    expect(slots.topic).toBeUndefined();
    expect(slots.year).toBeUndefined();
  });

  it('bare subject does not count as an explicit question list ask', () => {
    const { wantsQuestionList } = require('../ai/runtime/intent-gate') as typeof import('../ai/runtime/intent-gate');
    expect(wantsQuestionList('Physics', { subject: 'Physics' })).toBe(false);
    expect(wantsQuestionList('list questions', { subject: 'Physics' })).toBe(true);
    expect(wantsQuestionList('Physics 2023', { subject: 'Physics', year: 2023 })).toBe(true);
    expect(wantsQuestionList('Algebra', { topic: 'Algebra' })).toBe(true);
  });

  it('search about X drops sticky year', () => {
    const slots = fillSlots(
      'search about osmosis',
      {},
      { subject: 'Biology', year: 2024 },
      BANK,
    );
    // Unrelated sticky subject must not constrain semantic search.
    expect(slots.subject).toBeUndefined();
    expect(slots.year).toBeUndefined();
  });

  it('search keeps subject when the message names it', () => {
    const slots = fillSlots(
      'search Biology about osmosis',
      {},
      { subject: 'Physics', year: 2024 },
      BANK,
    );
    expect(slots.subject).toBe('Biology');
    expect(slots.year).toBeUndefined();
  });

  it('keeps year when the new message also names a year after subject change', () => {
    const slots = fillSlots(
      'Physics 2023',
      { subject: 'Biology', subjectCode: 'BIO', year: 2024 },
      {},
      BANK,
    );
    expect(slots.subject).toBe('Physics');
    expect(slots.year).toBe(2023);
  });

  it('renders year catalogue from list_exam_years output', () => {
    const reply = renderToolReply('catalogue', 'what years are available?', [
      { count: 2, years: [2023, 2024], subject: null },
    ]);
    expect(reply).toContain('### Years');
    expect(reply).toContain('2023');
    expect(reply).toContain('2024');
  });
});
