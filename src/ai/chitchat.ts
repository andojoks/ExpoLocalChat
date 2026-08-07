import type { CatalogueSnapshot } from '@/ai/runtime/catalogue-snapshot';
import { examplePrompt, sampleSubjectNames, sampleYears } from '@/ai/runtime/catalogue-snapshot';

/**
 * Lightweight intent gate — NOT a forced-tool bootstrap.
 * Pure greetings / meta chat must not bind tools (tiny local models over-call them).
 */
export function isChitchatMessage(message: string): boolean {
  const text = message.toLowerCase().trim().replace(/\s+/g, ' ');
  if (!text) return true;
  if (
    /^(hi|hello|hey|yo|sup|hiya|howdy)([!?. ]|$)/.test(text) &&
    text.length <= 24 &&
    !/\b(exam|paper|question|gce|year|subject|20\d{2})\b/.test(text)
  ) {
    return true;
  }
  return /^(thanks|thank you|thx|ok|okay|bye|goodbye|good (morning|afternoon|evening)|who are you|what can you do|what do you do|help)([!?. ]|$)/.test(
    text,
  );
}

/** Instant replies so web does not block on SmolLM download for greetings. */
export function cannedChitchatReply(
  message: string,
  catalogue?: CatalogueSnapshot,
): string | null {
  const text = message.toLowerCase().trim().replace(/\s+/g, ' ');
  const example = examplePrompt(catalogue);
  if (!text) {
    return 'Hi — ask for subjects, a year/paper list, or a topic to search.';
  }
  if (/^(hi|hello|hey|yo|sup|hiya|howdy)\b/.test(text)) {
    return `Hi — I'm your on-device Cameroon GCE tutor.\n\nTry **What subjects are available?**, **${example}**, or ask to explain a listed question.`;
  }
  if (/who are you|what can you do|what do you do|^help$/.test(text)) {
    return `I browse a local GCE question bank on this device:\n\n- Catalogue (categories & subjects)\n- List papers / questions by year\n- Search topics\n- Explain a question with prompt, answer, and solution\n\nAsk: **What subjects are available?**`;
  }
  if (/^(thanks|thank you|thx)\b/.test(text)) {
    return `You're welcome. What should we study next?`;
  }
  if (/^(ok|okay)\b/.test(text)) {
    return `Great. Name a subject or year when you're ready.`;
  }
  if (/^(bye|goodbye)\b/.test(text)) {
    return `Good luck with your revision — come back anytime.`;
  }
  if (/good (morning|afternoon|evening)/.test(text)) {
    return `Hello — ready when you are. Ask for subjects or a paper year.`;
  }
  return null;
}

export function cannedClarifyReply(
  missing: string,
  catalogue?: CatalogueSnapshot,
): string {
  if (missing === 'subject') {
    const names = sampleSubjectNames(catalogue, 4);
    if (names.length) {
      return `Which subject should I use — ${names.map((n) => `**${n}**`).join(', ')}?`;
    }
    return 'Which subject from the catalogue should I use?';
  }
  if (missing === 'year') {
    const years = sampleYears(catalogue, 3);
    if (years.length) {
      return `Which year — for example ${years.map((y) => `**${y}**`).join(' or ')}?`;
    }
    return 'Which year should I use?';
  }
  if (missing === 'question') {
    return 'Which question should I explain? List questions first, then say **explain** with an id.';
  }
  return `What **${missing}** should I use?`;
}
