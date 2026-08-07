import { describe, expect, it } from '@jest/globals';
import { HashEmbeddingProvider, cosine } from '../ai/embeddings/embedding';
import { SEED_BANK } from './fixtures/exam-bank-fixture';
import {
  embedTextCategory,
  embedTextQuestion,
  embedTextSubject,
  normalizeCategoryCode,
} from '../db/exam-bank';

describe('exam bank embedding helpers', () => {
  it('ranks osmosis question above unrelated category text', async () => {
    const embeddings = new HashEmbeddingProvider();
    const query = await embeddings.embedQuery('Define osmosis in biology');
    const osmosis = SEED_BANK.questions.find((q) => q.id === 'ol-bio-2024-p1-q8');
    const math = SEED_BANK.questions.find((q) => q.id === 'ol-math-2023-p1-q4');
    expect(osmosis).toBeTruthy();
    expect(math).toBeTruthy();

    const osmosisVec = await embeddings.embedDocuments([embedTextQuestion(osmosis!)]);
    const mathVec = await embeddings.embedDocuments([embedTextQuestion(math!)]);
    expect(cosine(query, osmosisVec[0])).toBeGreaterThan(cosine(query, mathVec[0]));
  });

  it('embeds category and subject labels deterministically', async () => {
    const embeddings = new HashEmbeddingProvider();
    const cat = SEED_BANK.categories[0];
    const sub = SEED_BANK.subjects.find((s) => s.categoryId === cat.id)!;
    const [a, b] = await embeddings.embedDocuments([
      embedTextCategory(cat),
      embedTextSubject(sub, cat.code),
    ]);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBe(a.length);
    expect(normalizeCategoryCode('o level')).toBe('GCE_OL');
  });
});
