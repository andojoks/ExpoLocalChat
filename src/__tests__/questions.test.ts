import { describe, expect, it } from '@jest/globals';
import { SEED_BANK, SEED_QUESTIONS } from './fixtures/exam-bank-fixture';
import { normalizeCategoryCode } from '../db/exam-bank';

describe('exam bank fixture shape', () => {
  it('defines GCE OL and AL categories with subjects', () => {
    expect(SEED_BANK.categories.map((c) => c.code).sort()).toEqual(['GCE_AL', 'GCE_OL']);
    expect(SEED_BANK.subjects.length).toBeGreaterThanOrEqual(4);
    for (const subject of SEED_BANK.subjects) {
      expect(SEED_BANK.categories.some((c) => c.id === subject.categoryId)).toBe(true);
      expect(subject.code).toBeTruthy();
      expect(subject.descriptionMd).toBeTruthy();
    }
  });

  it('supports papers with and without sections', () => {
    const withSections = SEED_BANK.papers.find((p) => p.id === 'paper-ol-math-2024-p2');
    const without = SEED_BANK.papers.find((p) => p.id === 'paper-ol-math-2023-p1');
    expect(withSections).toBeTruthy();
    expect(without).toBeTruthy();
    expect(SEED_BANK.paperSections.some((row) => row.paperId === withSections!.id)).toBe(true);
    expect(SEED_BANK.paperSections.some((row) => row.paperId === without!.id)).toBe(false);
  });

  it('supports nested free-form questions linked via paper_questions pivot', () => {
    const parent = SEED_BANK.questions.find((q) => q.id === 'ol-math-2024-p2-q1');
    const children = SEED_BANK.questions.filter((q) => q.parentQuestionId === parent?.id);
    expect(parent?.solutionMd).toBeTruthy();
    expect(children.map((c) => c.numberLabel).sort()).toEqual(['1(a)', '1(b)']);
    expect(SEED_BANK.paperQuestions.some((row) => row.questionId === parent!.id)).toBe(true);
    expect(SEED_BANK.paperQuestions.some((row) => row.questionId === children[0].id)).toBe(true);
  });

  it('keeps a flat SEED_QUESTIONS projection for legacy helpers', () => {
    expect(new Set(SEED_QUESTIONS.map((q) => q.category))).toEqual(new Set(['OL', 'AL']));
    expect(new Set(SEED_QUESTIONS.map((q) => q.year))).toEqual(new Set([2023, 2024]));
    const math2023 = SEED_QUESTIONS.filter((q) => q.subject === 'Mathematics' && q.year === 2023);
    expect(math2023.map((q) => q.category).sort()).toEqual(['AL', 'OL']);
  });

  it('normalizes category aliases', () => {
    expect(normalizeCategoryCode('OL')).toBe('GCE_OL');
    expect(normalizeCategoryCode('A Level')).toBe('GCE_AL');
    expect(normalizeCategoryCode('GCE_OL')).toBe('GCE_OL');
  });
});
