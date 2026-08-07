import type { SQLiteDatabase } from 'expo-sqlite';
import {
  listCategories,
  listPaperYears,
  listSubjects,
  listTopics,
} from '@/db/database';

export type CatalogueCategory = {
  code: string;
  name: string;
  /** Lowercase tokens derived from code/name for matching (not a fixed subject list). */
  aliases: string[];
};

export type CatalogueSubject = {
  id: string;
  code: string;
  name: string;
  categoryCode: string;
};

export type CatalogueSnapshot = {
  categories: CatalogueCategory[];
  subjects: CatalogueSubject[];
  years: number[];
  topics: string[];
};

/** Build soft aliases from a category code/name so OL/AL-style shorthand works without hard-coding subjects. */
export function deriveCategoryAliases(code: string, name: string): string[] {
  const aliases = new Set<string>();
  const add = (value: string) => {
    const n = normalizeLoose(value);
    if (n) aliases.add(n);
  };
  add(code);
  add(name);
  add(code.replace(/^GCE_?/i, ''));
  add(code.replace(/_/g, ' '));
  const compact = code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (compact) aliases.add(compact);
  // Common GCE shorthand derived from code fragments (OL / AL), not from a subject table.
  if (/\bol\b/i.test(code) || /ordinary/i.test(name)) {
    add('ol');
    add('o level');
    add('ordinary');
    add('ordinary level');
  }
  if (/\bal\b/i.test(code) || /advanced/i.test(name)) {
    add('al');
    add('a level');
    add('advanced');
    add('advanced level');
  }
  return [...aliases];
}

export async function loadCatalogueSnapshot(db: SQLiteDatabase): Promise<CatalogueSnapshot> {
  const [categories, subjects, years, topics] = await Promise.all([
    listCategories(db).catch(() => []),
    listSubjects(db).catch(() => []),
    listPaperYears(db).catch(() => [] as number[]),
    listTopics(db).catch(() => [] as string[]),
  ]);

  const catById = new Map(categories.map((c) => [c.id, c.code]));

  return {
    categories: categories.map((c) => ({
      code: c.code,
      name: c.name,
      aliases: deriveCategoryAliases(c.code, c.name),
    })),
    subjects: subjects.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      categoryCode: catById.get(s.categoryId) || '',
    })),
    years,
    topics,
  };
}

export function matchCategory(
  message: string,
  catalogue?: CatalogueSnapshot,
): { code: string; name: string } | undefined {
  if (!catalogue?.categories.length) return undefined;
  const text = normalizeLoose(message);
  let best: { code: string; name: string } | undefined;
  let bestLen = 0;
  for (const cat of catalogue.categories) {
    for (const alias of cat.aliases) {
      if (!alias) continue;
      if (containsTokenOrPhrase(text, alias) && alias.length >= bestLen) {
        best = { code: cat.code, name: cat.name };
        bestLen = alias.length;
      }
    }
  }
  return best;
}

export function matchSubject(
  message: string,
  catalogue?: CatalogueSnapshot,
  categoryCode?: string,
): CatalogueSubject | undefined {
  if (!catalogue?.subjects.length) return undefined;
  const text = normalizeLoose(message);
  const pool = categoryCode
    ? catalogue.subjects.filter((s) => !s.categoryCode || s.categoryCode === categoryCode)
    : catalogue.subjects;
  // Prefer longest name/code hit so "Further Mathematics" beats "Mathematics".
  let best: CatalogueSubject | undefined;
  let bestScore = 0;
  for (const subject of pool.length ? pool : catalogue.subjects) {
    const name = normalizeLoose(subject.name);
    const code = normalizeLoose(subject.code);
    const nameScore = containsTokenOrPhrase(text, name) ? name.length : 0;
    const codeScore = code && containsTokenOrPhrase(text, code) ? code.length + 0.5 : 0;
    const score = Math.max(nameScore, codeScore);
    if (score > bestScore) {
      best = subject;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : undefined;
}

export function matchTopic(message: string, catalogue?: CatalogueSnapshot): string | undefined {
  if (!catalogue?.topics.length) return undefined;
  const text = normalizeLoose(message);
  let best: string | undefined;
  let bestLen = 0;
  for (const topic of catalogue.topics) {
    const label = normalizeLoose(topic);
    if (label.length >= 3 && containsTokenOrPhrase(text, label) && label.length > bestLen) {
      best = topic;
      bestLen = label.length;
    }
  }
  return best;
}

/** True if the message mentions any catalogue subject (by name or code). */
export function messageMentionsSubject(message: string, catalogue?: CatalogueSnapshot): boolean {
  return !!matchSubject(message, catalogue);
}

export function sampleSubjectNames(catalogue: CatalogueSnapshot | undefined, n = 3): string[] {
  if (!catalogue?.subjects.length) return [];
  const unique = [...new Map(catalogue.subjects.map((s) => [s.name, s.name])).values()];
  return unique.slice(0, n);
}

export function sampleYears(catalogue: CatalogueSnapshot | undefined, n = 2): number[] {
  if (!catalogue?.years.length) return [];
  return catalogue.years.slice(-n);
}

export function examplePrompt(catalogue?: CatalogueSnapshot): string {
  const subjects = sampleSubjectNames(catalogue, 1);
  const years = sampleYears(catalogue, 1);
  if (subjects[0] && years[0]) return `${subjects[0]} ${years[0]}`;
  if (subjects[0]) return subjects[0];
  return 'a subject and year from the catalogue';
}

export function normalizeLoose(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function containsTokenOrPhrase(haystack: string, needle: string) {
  if (!haystack || !needle) return false;
  if (haystack === needle || haystack.includes(` ${needle} `)) return true;
  if (haystack.startsWith(`${needle} `) || haystack.endsWith(` ${needle}`)) return true;
  if (!needle.includes(' ') && haystack.split(' ').includes(needle)) return true;
  // Compact codes (bio, math): prefix of a token when length >= 3 — never bare substring
  // so "al" does not match inside "algebra" and "ol" does not match inside "biology".
  if (!needle.includes(' ') && needle.length >= 3) {
    return haystack.split(' ').some((part) => part === needle || part.startsWith(needle));
  }
  return false;
}
