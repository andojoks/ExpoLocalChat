import { describe, expect, it } from '@jest/globals';
import { cleanGeneratedText, cleanTokenDelta } from '@/ai/output-sanitizer';

const turns = [
  {
    role: 'system' as const,
    content: 'You are QuestionBank Tutor, a warm, concise, expert study companion.',
  },
  { role: 'user' as const, content: 'Who are you?' },
];

describe('output sanitizer', () => {
  it('removes leaked system prompts', () => {
    expect(
      cleanGeneratedText(
        'You are QuestionBank Tutor, a warm, concise, expert study companion.',
        turns,
      ),
    ).toBe('');
  });

  it('keeps assistant content after chat markers', () => {
    expect(
      cleanGeneratedText('<|im_start|>assistant\nI can help with past questions.<|im_end|>', turns),
    ).toBe('I can help with past questions.');
  });

  it('only streams safe deltas', () => {
    const first = cleanTokenDelta('You are QuestionBank Tutor', '', turns);
    expect(first.delta).toBe('');
    const second = cleanTokenDelta('<|im_start|>assistant\nHello', '', turns);
    expect(second.delta).toBe('Hello');
  });
});
