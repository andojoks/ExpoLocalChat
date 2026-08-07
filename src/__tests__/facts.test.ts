import { describe, expect, it } from '@jest/globals';
import {
  formatEvidence,
  looksLikeJsonReply,
  renderFactsReply,
  renderToolReply,
} from '../ai/runtime/facts';

describe('facts formatting', () => {
  it('turns list tool JSON into plain bullets', () => {
    const facts = formatEvidence([
      {
        count: 2,
        items: [
          { code: 'GCE_OL', name: 'GCE Ordinary Level', description: 'Form 5' },
          { code: 'MATH', name: 'Mathematics', description: 'Algebra' },
        ],
      },
    ]);
    expect(facts).toContain('GCE Ordinary Level');
    expect(facts).toContain('Mathematics');
    expect(facts).toContain('GCE_OL');
    expect(facts).not.toContain('"count"');
  });

  it('renders catalogue with categories and subjects sections', () => {
    const reply = renderToolReply('catalogue', 'What subjects are available?', [
      {
        items: [
          { code: 'GCE_OL', name: 'GCE Ordinary Level' },
          { code: 'GCE_AL', name: 'GCE Advanced Level' },
        ],
      },
      {
        items: [
          { code: 'MATH', name: 'Mathematics' },
          { code: 'BIO', name: 'Biology' },
        ],
      },
    ]);
    expect(reply).toContain('### Subjects');
    expect(reply).toContain('Mathematics');
    expect(reply).toContain('Biology');
  });

  it('renders year coverage from list_exam_years', () => {
    const reply = renderToolReply('catalogue', 'what years are available?', [
      { years: [2023, 2024], count: 2 },
    ]);
    expect(reply).toContain('### Years');
    expect(reply).toContain('2023');
  });

  it('renders question lists as readable markdown blocks', () => {
    const reply = renderToolReply('list', 'list Biology 2024', [
      {
        items: [
          {
            id: 'ol-bio-2024-p1-q8',
            numberLabel: '8',
            subjectName: 'Biology',
            year: 2024,
            paperNumber: 1,
            stem: '### Question 8\nDefine **osmosis** and state the membrane required.',
          },
        ],
      },
    ]);
    expect(reply).toContain('**Biology · 2024 · P1 · Q8**');
    expect(reply).toContain('`ol-bio-2024-p1-q8`');
    expect(reply).toContain('Define osmosis');
    expect(reply).not.toContain('### Question');
    expect(reply).not.toMatch(/\*\*[^*]+\*\*\s*\nQuestion 8 /);
  });

  it('renders bare-subject paper browse without the empty-filter copy', () => {
    const reply = renderToolReply('list', 'Physics', [
      {
        items: [
          {
            id: 'paper-ol-phys-2023-p2',
            year: 2023,
            paperNumber: 2,
            subject: 'Physics',
            reference: 'GCE-OL-2023-PHYS-P2',
          },
        ],
      },
    ]);
    expect(reply).toContain('Papers on file');
    expect(reply).toContain('list questions');
    expect(reply).not.toContain('No questions matched');
  });

  it('renders a deterministic catalogue reply', () => {
    const reply = renderFactsReply(
      'catalogue',
      'What subjects are available?',
      '- Mathematics (MATH)\n- Biology (BIO)',
    );
    expect(reply.toLowerCase()).toContain('subject');
    expect(reply).toContain('Mathematics');
  });
});
