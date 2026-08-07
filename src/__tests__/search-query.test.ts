import { describe, expect, it } from '@jest/globals';
import { cleanSearchQuery } from '../ai/tools';

describe('cleanSearchQuery', () => {
  it('strips search verbs so the embedder sees the topic', () => {
    expect(cleanSearchQuery('search about osmosis')).toBe('osmosis');
    expect(cleanSearchQuery('find similar to cell biology')).toBe('cell biology');
    expect(cleanSearchQuery('osmosis')).toBe('osmosis');
  });
});
