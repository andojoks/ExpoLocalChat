import type { TutorIntent } from '@/domain/types';
import { isYearCoverageAsk } from '@/ai/runtime/intent-gate';

/** True when the model echoed JSON / tool payloads instead of tutor markdown. */
export function looksLikeJsonReply(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.startsWith('{') || t.startsWith('[')) return true;
  if (/"count"\s*:|"items"\s*:|"hits"\s*:|"truncated"\s*:/.test(t)) return true;
  if ((t.match(/[{}\[\]]/g) || []).length >= 4 && t.includes(':')) return true;
  return false;
}

/** Turn tool outputs into plain bullet Facts for the tiny local LLM. */
export function formatEvidence(parts: unknown[]): string {
  const lines: string[] = [];
  for (const part of parts) {
    lines.push(...factsFromPart(part));
  }
  const unique = [...new Set(lines.map((l) => l.trim()).filter(Boolean))];
  return unique.slice(0, 40).join('\n').slice(0, 1600);
}

/** Preferred tutor reply for tool-backed intents — no LLM required. */
export function renderToolReply(intent: TutorIntent, message: string, parts: unknown[]): string {
  if (intent === 'catalogue') return renderCatalogue(parts, message);
  if (intent === 'list') return renderList(parts);
  if (intent === 'search') return renderSearch(parts);
  if (intent === 'explain') return renderExplain(parts);
  return renderFactsReply(intent, message, formatEvidence(parts));
}

function renderCatalogue(parts: unknown[], message: string): string {
  const categories: string[] = [];
  const subjects: string[] = [];
  const years: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    const obj = part as Record<string, unknown>;
    if (Array.isArray(obj.years)) {
      for (const year of obj.years) {
        years.push(`- **${year}**`);
      }
      continue;
    }
    const items = Array.isArray(obj.items) ? (obj.items as Record<string, unknown>[]) : [];
    for (const item of items) {
      if (item.code && item.name && String(item.code).startsWith('GCE_')) {
        categories.push(`- **${item.name}** (\`${item.code}\`)`);
      } else if (item.code && item.name) {
        const level = item.categoryCode
          ? ` · ${String(item.categoryCode).replace(/^GCE_/, '')}`
          : '';
        subjects.push(`- **${item.name}** (\`${item.code}\`${level})`);
      }
    }
  }
  const wantsSubjects = /\bsubjects?\b/i.test(message);
  const wantsYears = isYearCoverageAsk(message);
  const sections: string[] = [];
  if (years.length) {
    const scope =
      wantsYears && /\b(for|of|in)\b/i.test(message)
        ? ' for that filter'
        : '';
    sections.push(`### Years${scope}\n${years.join('\n')}`);
  }
  if (categories.length) {
    sections.push(`### Categories\n${categories.join('\n')}`);
  }
  if (subjects.length) {
    sections.push(`### Subjects\n${subjects.slice(0, 24).join('\n')}`);
  }
  if (!sections.length) {
    return 'I could not load the exam catalogue yet. Try again in a moment.';
  }
  const intro = wantsYears
    ? 'Years available in the question bank:'
    : wantsSubjects
      ? 'Here is what is available in the question bank:'
      : 'Exam catalogue:';
  return `${intro}\n\n${sections.join('\n\n')}\n\nTry a **subject** and **year** from the catalogue, or ask to list a paper.`;
}

function renderList(parts: unknown[]): string {
  const questionBlocks: string[] = [];
  const paperLines: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    const obj = part as Record<string, unknown>;
    const items = Array.isArray(obj.items) ? (obj.items as Record<string, unknown>[]) : [];
    for (const item of items) {
      if (item.numberLabel != null || item.stem) {
        const block = questionBlockFromItem(item);
        if (block) questionBlocks.push(block);
      } else {
        paperLines.push(...factLineFromItem(item));
      }
    }
  }
  const questions = questionBlocks.slice(0, 12);
  const papers = [...new Set(paperLines)].slice(0, 12);
  if (questions.length) {
    return [
      'Here is what I found:',
      '',
      questions.join('\n\n'),
      '',
      'Say **explain** plus a question id, or ask for another filter.',
    ].join('\n');
  }
  if (papers.length) {
    // Intentional paper browse (bare subject) vs empty-question fallback both land here.
    const looksLikeFallback = parts.some((part) => {
      if (!part || typeof part !== 'object') return false;
      const obj = part as { items?: unknown[]; total?: number };
      return Array.isArray(obj.items) && obj.items.length === 0;
    });
    if (looksLikeFallback) {
      return [
        'No questions matched that exact filter. Papers on file for this subject:',
        '',
        papers.join('\n'),
        '',
        'Try one of those years, or another subject from the catalogue.',
      ].join('\n');
    }
    return [
      'Papers on file:',
      '',
      papers.join('\n'),
      '',
      'Say **list questions** or add a **year** (e.g. **Physics 2023**) to see questions.',
    ].join('\n');
  }
  return 'No matching papers or questions found. Try another subject or year from the catalogue.';
}

function renderSearch(parts: unknown[]): string {
  const hits: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    const obj = part as Record<string, unknown>;
    if (!Array.isArray(obj.hits)) continue;
    for (const hit of obj.hits as Record<string, unknown>[]) {
      const label = String(hit.label || hit.id || 'hit');
      const snippet = hit.snippet ? plainStem(String(hit.snippet), 100) : '';
      const level = hit.level ? ` _(${hit.level})_` : '';
      hits.push(
        snippet
          ? `- **${label}**${level}\n  ${snippet}`
          : `- **${label}**${level}`,
      );
    }
  }
  if (!hits.length) {
    return 'No close matches in the exam bank. Try a subject name or a topic word like **osmosis**.';
  }
  return `Closest matches:\n\n${hits.slice(0, 10).join('\n\n')}`;
}

function renderExplain(parts: unknown[]): string {
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    const obj = part as Record<string, unknown>;
    if (obj.missing) {
      return `I could not find that question (\`${obj.id || '?'}\`). List questions first, then say **explain** with an id.`;
    }
    if (!obj.promptMd && !obj.numberLabel && !obj.id) continue;
    const title = `### Question ${obj.numberLabel || ''}${obj.topic ? ` · ${obj.topic}` : ''}`.trim();
    const bits = [
      title,
      obj.marks != null ? `**Marks:** ${obj.marks}` : null,
      '',
      '**Prompt**',
      String(obj.promptMd || '').trim() || '_No prompt stored._',
      '',
      obj.answerMd ? '**Answer**' : null,
      obj.answerMd ? String(obj.answerMd).trim() : null,
      '',
      obj.solutionMd ? '**Solution**' : null,
      obj.solutionMd ? String(obj.solutionMd).trim() : null,
    ].filter((line) => line != null) as string[];

    if (Array.isArray(obj.children) && obj.children.length) {
      bits.push('', '**Parts**');
      for (const child of obj.children as Record<string, unknown>[]) {
        bits.push(
          `\n**${child.numberLabel || 'Part'}** (${child.marks ?? '?'} marks)\n${String(child.promptMd || '').trim()}`,
        );
        if (child.answerMd) bits.push(`Answer: ${String(child.answerMd).trim()}`);
        if (child.solutionMd) bits.push(String(child.solutionMd).trim());
      }
    }
    if (Array.isArray(obj.hints) && obj.hints.length) {
      bits.push('', '**Hints**');
      for (const hint of obj.hints as string[]) bits.push(`- ${hint}`);
    }
    return bits.join('\n').trim();
  }
  return 'I do not have question details for that yet. List a paper first, then ask me to explain a question.';
}

function factsFromPart(part: unknown): string[] {
  if (part == null) return [];
  if (typeof part === 'string') {
    const s = part.trim();
    if (!s) return [];
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        return factsFromPart(JSON.parse(s));
      } catch {
        return [`- ${clip(s, 120)}`];
      }
    }
    return s
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => (line.startsWith('-') ? line : `- ${clip(line, 120)}`));
  }
  if (typeof part !== 'object') return [`- ${String(part)}`];
  const obj = part as Record<string, unknown>;

  if (obj.truncated && typeof obj.preview === 'string' && !obj.items && !obj.hits) {
    const raw = String(obj.preview).replace(/…$/, '');
    try {
      return factsFromPart(JSON.parse(raw));
    } catch {
      return [`- ${clip(String(obj.preview), 120)}`];
    }
  }

  if (Array.isArray(obj.hits) && obj.hits[0] && typeof (obj.hits[0] as any).role === 'string') {
    return [];
  }

  if (Array.isArray(obj.items)) {
    return (obj.items as Record<string, unknown>[]).flatMap((item) => factLineFromItem(item));
  }
  if (Array.isArray(obj.hits)) {
    return (obj.hits as Record<string, unknown>[]).map((hit) => {
      const label = String(hit.label || hit.id || 'hit');
      const snippet = hit.snippet ? `: ${clip(String(hit.snippet), 80)}` : '';
      const level = hit.level ? ` [${hit.level}]` : '';
      return `- ${label}${level}${snippet}`;
    });
  }
  if (obj.missing) return [`- Question not found (${obj.id || '?'})`];
  if (obj.promptMd || obj.numberLabel || obj.id) {
    const lines = [
      `- Q${obj.numberLabel || ''} ${obj.topic || ''}`.trim(),
      obj.promptMd ? `- Prompt: ${clip(String(obj.promptMd), 160)}` : null,
      obj.answerMd ? `- Answer: ${clip(String(obj.answerMd), 100)}` : null,
      obj.solutionMd ? `- Solution: ${clip(String(obj.solutionMd), 200)}` : null,
    ].filter(Boolean) as string[];
    if (Array.isArray(obj.children)) {
      for (const child of obj.children as Record<string, unknown>[]) {
        lines.push(
          `- Part ${child.numberLabel || ''}: ${clip(String(child.promptMd || ''), 100)}`,
        );
      }
    }
    return lines;
  }
  return [];
}

function factLineFromItem(item: Record<string, unknown>): string[] {
  // Question stems must win before year+paper (list items include both).
  if (item.numberLabel != null || item.stem) {
    const block = questionBlockFromItem(item);
    return block ? [block.replace(/\n/g, ' — ')] : [];
  }
  if (item.code && item.name) {
    const level =
      item.categoryCode || item.category
        ? ` · ${String(item.categoryCode || item.category).replace(/^GCE_/, '')}`
        : '';
    const desc = item.description ? ` — ${clip(String(item.description), 50)}` : '';
    return [`- **${item.name}** (\`${item.code}\`${level})${desc}`];
  }
  if (item.year != null && (item.paperNumber != null || item.paper != null)) {
    const paper = item.paperNumber ?? item.paper;
    const subject = item.subject || item.subjectName || '';
    const ref = item.reference || item.title || '';
    return [
      `- **${subject} ${item.year} Paper ${paper}**${ref ? ` — \`${ref}\`` : ''}`.trim(),
    ];
  }
  if (item.name) return [`- **${item.name}**${item.code ? ` (\`${item.code}\`)` : ''}`];
  if (item.id) return [`- \`${item.id}\``];
  return [];
}

/** Multi-line markdown block for a question list item (no nested headings). */
function questionBlockFromItem(item: Record<string, unknown>): string | null {
  const where = [
    item.subjectName,
    item.year,
    item.paperNumber != null ? `P${item.paperNumber}` : '',
    item.numberLabel != null ? `Q${item.numberLabel}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const idHint = item.id ? ` (\`${item.id}\`)` : '';
  const stem = plainStem(String(item.stem || item.topic || ''), 140);
  if (!where && !stem) return null;
  return `**${where || 'Question'}**${idHint}${stem ? `\n${stem}` : ''}`;
}

/** Strip heading markers / latex noise so chat markdown stays readable. */
function plainStem(raw: string, max = 140): string {
  const cleaned = String(raw || '')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*question\s+\d+[a-z()]*/i, '')
    .replace(/\*\*/g, '')
    .replace(/\$\$([^$]+)\$\$/g, '$1')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    .replace(/\\+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clip(cleaned, max);
}

/** Deterministic markdown when the tiny model echoes JSON. */
export function renderFactsReply(intent: TutorIntent, message: string, facts: string): string {
  const bullets = facts
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-'));
  if (!bullets.length) {
    if (intent === 'catalogue') {
      return 'I could not load the exam catalogue yet. Try again in a moment.';
    }
    if (intent === 'list') {
      return 'No matching papers or questions found. Try another subject or year.';
    }
    if (intent === 'search') {
      return 'No close matches in the exam bank. Try a subject name or a topic word.';
    }
    return 'I do not have enough exam-bank facts for that yet.';
  }

  const intro =
    intent === 'catalogue'
      ? message.toLowerCase().includes('subject')
        ? 'Here are the subjects (and categories) in the bank:'
        : 'Here is what is in the exam catalogue:'
      : intent === 'list'
        ? 'Here are the matching papers/questions:'
        : intent === 'search'
          ? 'Closest matches from the exam bank:'
          : intent === 'explain'
            ? 'From the question bank:'
            : 'From the exam bank:';

  return `${intro}\n\n${bullets.slice(0, 20).join('\n')}`;
}

function clip(value: string, max: number) {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
