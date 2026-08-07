import { cosine, type EmbeddingProvider } from '@/ai/embeddings/embedding';
import { isChitchatMessage } from '@/ai/chitchat';
import {
  messageMentionsSubject,
  type CatalogueSnapshot,
} from '@/ai/runtime/catalogue-snapshot';
import type { AgentContext, ExamSlots, TutorIntent } from '@/domain/types';

const INTENT_PROTOTYPES: Record<Exclude<TutorIntent, 'clarify'>, string> = {
  chitchat: 'hello thanks bye who are you what can you do small talk greeting',
  catalogue: 'what subjects years papers are available present catalogue do you have',
  list: 'show list all paper questions from year subject exact filters',
  search: 'find search about topic concept similar related vague question wording',
  explain: 'explain answer hint solution step why that this question details',
};

let prototypeVectors: { intent: Exclude<TutorIntent, 'clarify'>; vector: number[] }[] | null =
  null;

export async function warmIntentGate(embeddings: EmbeddingProvider) {
  await embeddings.initialize();
  const intents = Object.keys(INTENT_PROTOTYPES) as Exclude<TutorIntent, 'clarify'>[];
  const vectors = await embeddings.embedDocuments(
    intents.map((intent) => INTENT_PROTOTYPES[intent]),
    intents,
  );
  prototypeVectors = intents.map((intent, index) => ({ intent, vector: vectors[index] }));
}

/** Deterministic intent gate with embedding tie-break when ambiguous. */
export async function resolveIntent(
  message: string,
  context: AgentContext,
  embeddings: EmbeddingProvider,
  catalogue?: CatalogueSnapshot,
): Promise<TutorIntent> {
  const text = message.toLowerCase().trim();
  if (isChitchatMessage(message)) return 'chitchat';

  // Sticky explain only for clear follow-ups — not "this year" / "is it available".
  if (
    (context.activeQuestionId || context.lastTool === 'get_question_details') &&
    (/\b(explain|solution|hint|walk\s*through)\b/.test(text) ||
      /\b(explain\s+)?(that|this)\s+(question|one)\b/.test(text) ||
      /^(why|how)\b/.test(text))
  ) {
    return 'explain';
  }

  const mentionsSubject = messageMentionsSubject(message, catalogue);
  const hasYear = /\b(20\d{2})\b/.test(text);

  // Year inventory asks stay on catalogue (even when a subject is named).
  if (isYearCoverageAsk(text)) {
    return 'catalogue';
  }

  // Sections for a known paper (sticky lastPaperId / prior context).
  if (/\bsections?\b/.test(text) && (context.lastPaperId || !!context.subject || !!context.year)) {
    return 'list';
  }

  // "what X questions are available" → list when a catalogue subject or year is present.
  if (
    /\b(available|present|catalogue|what years|which subjects|do you have)\b/.test(text) &&
    !(
      /\bquestions?\b/.test(text) &&
      (hasYear || mentionsSubject || /\bpaper\b/.test(text) || !!context.subject || !!context.year)
    )
  ) {
    return 'catalogue';
  }

  if (
    /\b(20\d{2}|list|show|paper\s*[123]|all questions|questions?\s+are\s+available)\b/.test(text)
  ) {
    return 'list';
  }

  // Subject mention from the live catalogue (no hard-coded course names).
  if (mentionsSubject && !/\b(explain|solution|hint|define)\b/.test(text)) {
    return 'list';
  }

  if (/\b(explain|answer|hint|solution|step|why)\b/.test(text)) {
    return 'explain';
  }

  if (/\b(find|search|about|topic|concept|related|similar|contains|include|includes)\b/.test(text)) {
    return 'search';
  }

  if (!prototypeVectors) await warmIntentGate(embeddings);
  const query = await embeddings.embedQuery(message);
  let best: TutorIntent = 'search';
  let bestScore = -1;
  for (const row of prototypeVectors || []) {
    const score = cosine(query, row.vector);
    if (score > bestScore) {
      bestScore = score;
      best = row.intent;
    }
  }
  return bestScore >= 0.25 ? best : 'search';
}

export function slotsNeedClarify(intent: TutorIntent, slots: ExamSlots): ExamSlots['missing'] {
  if (intent === 'catalogue' || intent === 'chitchat') return undefined;
  if (intent === 'explain' && !slots.activeQuestionId) return 'question';
  if (intent === 'list') {
    if (!slots.year && !slots.subject && !slots.topic) return 'subject';
  }
  return undefined;
}

/** After slots are filled: prefer list when exam filters are present. */
export function coerceIntentFromSlots(
  intent: TutorIntent,
  slots: ExamSlots,
  message: string,
): TutorIntent {
  if (intent === 'chitchat' || intent === 'explain' || intent === 'catalogue') return intent;

  const hasListVerb = /\b(list|show|paper\s*[123])\b/i.test(message);
  const hasStrongSearchVerb = /\b(find|search|similar|related)\b/i.test(message);
  // Keep "about" for semantic search, but not bare "what about <subject>" browse follow-ups.
  const hasAboutSearch =
    /\babout\b/i.test(message) && !/\bwhat\s+about\b/i.test(message);
  if (intent === 'search' && (hasStrongSearchVerb || hasAboutSearch) && !hasListVerb) {
    return 'search';
  }

  // Subject resolved from the catalogue → browse/list, not vague search.
  if (slots.subject || slots.subjectCode) {
    if (intent === 'search') return 'list';
  }
  if (intent === 'search' && (slots.year || slots.paper) && slots.topic) {
    return 'list';
  }
  if (
    intent !== 'list' &&
    (slots.subject || slots.year || slots.paper || slots.topic) &&
    !/\b(find|search)\b/i.test(message)
  ) {
    return 'list';
  }
  return intent;
}

/** True when the user is asking for year coverage / which years exist. */
export function isYearCoverageAsk(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(what|which)\s+years?\b/.test(t) ||
    /\byear\s+coverage\b/.test(t) ||
    /\byears?\s+(are\s+)?(available|present|on\s+file)\b/.test(t) ||
    /\byears?\s+(for|of|in)\b/.test(t) ||
    /\bavailable\s+years?\b/.test(t)
  );
}

/**
 * Questions are only fetched when the user asks for them (list/show/questions),
 * or gives a year/paper/topic filter. A bare subject name alone is not enough.
 */
export function wantsQuestionList(message: string, slots: ExamSlots): boolean {
  if (slots.year || slots.paper || slots.topic) return true;
  const t = message.toLowerCase();
  if (/\bquestions?\b/.test(t)) return true;
  if (/\b(list|show)\b/.test(t) && !/\bpapers?\b/.test(t)) return true;
  if (/\bpaper\s*[123]\b/.test(t)) return true;
  return false;
}
