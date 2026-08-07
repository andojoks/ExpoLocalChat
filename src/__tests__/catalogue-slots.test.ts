import { describe, expect, it } from '@jest/globals';
import {
  deriveCategoryAliases,
  matchCategory,
  matchSubject,
  matchTopic,
  messageMentionsSubject,
  type CatalogueSnapshot,
} from '../ai/runtime/catalogue-snapshot';
import { fillSlots } from '../ai/runtime/slots';
import { coerceIntentFromSlots, resolveIntent } from '../ai/runtime/intent-gate';
import { HashEmbeddingProvider } from '../ai/embeddings/embedding';

const FAKE_BANK: CatalogueSnapshot = {
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
    { id: 'sub-ol-agr', code: 'AGR', name: 'Agriculture', categoryCode: 'GCE_OL' },
    { id: 'sub-al-chem', code: 'CHEM', name: 'Chemistry', categoryCode: 'GCE_AL' },
  ],
  years: [2022, 2023, 2024],
  topics: ['Cell Biology', 'Soil Science', 'Stoichiometry'],
};

describe('catalogue snapshot matching', () => {
  it('derives OL/AL aliases from category codes without a subject table', () => {
    const aliases = deriveCategoryAliases('GCE_OL', 'GCE Ordinary Level');
    expect(aliases).toEqual(expect.arrayContaining(['ol', 'o level', 'gce ol']));
  });

  it('matches a dynamically added subject (Agriculture) from the snapshot', () => {
    const hit = matchSubject('Show me Agriculture paper 1', FAKE_BANK);
    expect(hit?.code).toBe('AGR');
    expect(hit?.name).toBe('Agriculture');
    expect(messageMentionsSubject('what about agriculture', FAKE_BANK)).toBe(true);
  });

  it('matches category aliases and topics from the snapshot', () => {
    expect(matchCategory('OL Biology', FAKE_BANK)?.code).toBe('GCE_OL');
    expect(matchTopic('tell me about Soil Science please', FAKE_BANK)).toBe('Soil Science');
  });

  it('fills slots from the catalogue snapshot, not hard-coded phrases', () => {
    const slots = fillSlots('Show OL Agriculture 2024', {}, {}, FAKE_BANK);
    expect(slots.category).toBe('GCE_OL');
    expect(slots.subject).toBe('Agriculture');
    expect(slots.subjectCode).toBe('AGR');
    expect(slots.year).toBe(2024);
  });

  it('routes subject follow-ups to list using the live catalogue', async () => {
    const intent = await resolveIntent(
      'what about Agriculture',
      {},
      new HashEmbeddingProvider(),
      FAKE_BANK,
    );
    expect(intent).toBe('list');
    const slots = fillSlots('what about Agriculture', {}, {}, FAKE_BANK);
    expect(coerceIntentFromSlots('search', slots, 'what about Agriculture')).toBe('list');
  });
});
