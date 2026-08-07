import type { AgentContext, ExamSlots } from '@/domain/types';
import {
  matchCategory,
  matchSubject,
  matchTopic,
  type CatalogueSnapshot,
} from '@/ai/runtime/catalogue-snapshot';
import { normalizeCategoryCode } from '@/db/database';

/** Merge structural + catalogue-driven entity extraction into exam slots. */
export function fillSlots(
  message: string,
  prior: ExamSlots = {},
  context: AgentContext = {},
  catalogue?: CatalogueSnapshot,
): ExamSlots {
  const yearMatches = [...message.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  const paperMatch = message.match(/\bpaper\s*([123])\b/i);
  const questionIdMatch = message.match(/\b([a-z]{2,}-?\d{4}-p\d+-q[\da-z()]+)\b/i);

  const categoryHit = matchCategory(message, catalogue);
  const categoryFromPrior = resolvePriorCategory(prior.category || context.category, catalogue);

  const subjectHit = matchSubject(message, catalogue, categoryHit?.code);
  const stickySubject = prior.subject || context.subject;
  // Fresh turns often have empty run prior and stickiness only in AgentContext.
  const subjectChanged =
    !!subjectHit?.name &&
    !!stickySubject &&
    subjectHit.name.toLowerCase() !== stickySubject.toLowerCase();
  const topicHit = matchTopic(message, catalogue);
  // Semantic search: do not inherit sticky year unless the user names one.
  const searchLed =
    /\b(find|search|similar|related)\b/i.test(message) ||
    (/\babout\b/i.test(message) && !/\bwhat\s+about\b/i.test(message));
  // Bare topic asks should browse the topic across the bank, not under a sticky subject.
  // Search messages may mention a topic word without intending to drop sticky subject.
  const topicLed =
    !!topicHit && !subjectHit && !yearMatches.length && !paperMatch && !searchLed;
  // "list questions" with no new filters — keep subject, drop year/topic sticky.
  const bareListAsk =
    /\b(list|show)\b/i.test(message) &&
    !subjectHit &&
    !topicHit &&
    !yearMatches.length &&
    !paperMatch &&
    !questionIdMatch;

  const nextSubject = topicLed
    ? undefined
    : searchLed
      ? subjectHit?.name
      : subjectHit?.name || stickySubject;
  const nextSubjectCode = topicLed
    ? undefined
    : searchLed
      ? subjectHit?.code
      : subjectHit?.code || (subjectChanged ? undefined : prior.subjectCode);
  const dropStickyFilters = subjectChanged || topicLed || bareListAsk;
  // Naming a subject (even after search cleared sticky subject) must not keep
  // another subject's paper/question ids — subjectChanged alone misses that case.
  const dropPaperStickiness = dropStickyFilters || !!subjectHit || searchLed;

  // Prefer message/subject category; drop sticky category on subject change or search.
  const categoryResolved = topicLed
    ? categoryHit?.code
    : searchLed
      ? categoryHit?.code || subjectHit?.categoryCode
      : categoryHit?.code ||
        subjectHit?.categoryCode ||
        (subjectChanged ? undefined : categoryFromPrior);

  const yearFromMessage = pickYear(yearMatches, catalogue);
  const paperFromMessage = paperMatch ? Number(paperMatch[1]) : undefined;
  const year =
    yearFromMessage ??
    (dropStickyFilters || searchLed ? undefined : prior.year ?? context.year);
  const paper =
    paperFromMessage ?? (dropStickyFilters || searchLed ? undefined : prior.paper);
  const lastPaperId = dropPaperStickiness
    ? undefined
    : prior.lastPaperId || context.lastPaperId;

  return {
    category: categoryResolved,
    subject: nextSubject,
    subjectCode: nextSubjectCode,
    // Naming a subject without a topic (or bare list) drops a prior topic.
    topic: topicHit || (subjectHit || bareListAsk ? undefined : prior.topic || context.topic),
    year,
    paper,
    sectionId: dropStickyFilters ? undefined : prior.sectionId,
    lastPaperId,
    page: prior.page || context.page || 1,
    pageSize: prior.pageSize || context.pageSize || 5,
    activeQuestionId: dropPaperStickiness
      ? questionIdMatch?.[1]
      : questionIdMatch?.[1] || prior.activeQuestionId || context.activeQuestionId,
  };
}

function resolvePriorCategory(
  value: string | undefined,
  catalogue?: CatalogueSnapshot,
): string | undefined {
  if (!value) return undefined;
  if (catalogue?.categories.some((c) => c.code === value)) return value;
  const fromAliases = matchCategory(String(value), catalogue);
  if (fromAliases) return fromAliases.code;
  // Legacy OL/AL → bank codes when snapshot missing or still GCE-shaped.
  return normalizeCategoryCode(value) || value;
}

function pickYear(matches: number[], catalogue?: CatalogueSnapshot): number | undefined {
  if (!matches.length) return undefined;
  const last = matches[matches.length - 1];
  if (!catalogue?.years.length) return last;
  if (catalogue.years.includes(last)) return last;
  const inBank = matches.filter((y) => catalogue.years.includes(y));
  return inBank.length ? inBank[inBank.length - 1] : last;
}

export function slotsToToolArgs(slots: ExamSlots, query?: string): Record<string, unknown> {
  return {
    ...(slots.category ? { category: slots.category } : {}),
    ...(slots.subject ? { subject: slots.subject } : {}),
    ...(slots.subjectCode ? { subjectCode: slots.subjectCode } : {}),
    ...(slots.topic ? { topic: slots.topic } : {}),
    ...(slots.year ? { year: slots.year } : {}),
    ...(slots.paper ? { paper: slots.paper } : {}),
    ...(slots.sectionId ? { sectionId: slots.sectionId } : {}),
    page: slots.page || 1,
    pageSize: slots.pageSize || 5,
    ...(query ? { query } : {}),
  };
}

/** Search args: subject soft-filter ok; never pass sticky year/paper/topic unless present. */
export function slotsToSearchArgs(slots: ExamSlots, query: string): Record<string, unknown> {
  return {
    query,
    ...(slots.category ? { category: slots.category } : {}),
    ...(slots.subject ? { subject: slots.subject } : {}),
    ...(slots.subjectCode ? { subjectCode: slots.subjectCode } : {}),
    topK: 8,
  };
}

export function slotsToContext(slots: ExamSlots, lastTool?: string): AgentContext {
  return {
    activeQuestionId: slots.activeQuestionId,
    category: slots.category,
    subject: slots.subject,
    topic: slots.topic,
    year: slots.year,
    lastPaperId: slots.lastPaperId,
    page: slots.page,
    pageSize: slots.pageSize,
    lastTool,
  };
}
