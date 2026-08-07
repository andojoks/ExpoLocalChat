import type { TutorTurn } from '@/ai/chat-model';
import {
  ANSWER_SYSTEM,
  CHITCHAT_SYSTEM,
  CLARIFY_SYSTEM,
  EXPLAIN_SYSTEM,
  clipText,
} from '@/ai/prompts';
import { formatEvidence } from '@/ai/runtime/facts';
import type { ExamSlots, TutorIntent } from '@/domain/types';

export { formatEvidence } from '@/ai/runtime/facts';

export function buildChitchatTurns(message: string): TutorTurn[] {
  return [
    { role: 'system', content: CHITCHAT_SYSTEM },
    { role: 'user', content: message },
  ];
}

export function buildClarifyTurns(message: string, missing: string, slots: ExamSlots): TutorTurn[] {
  return [
    { role: 'system', content: CLARIFY_SYSTEM },
    {
      role: 'user',
      content: `Student: ${clipText(message, 200)}\nMissing: ${missing}\nAsk ONE short question.`,
    },
  ];
}

const INTENT_CLOSER: Record<TutorIntent, string> = {
  catalogue: 'List every name in Facts as bullets. One intro sentence.',
  list: 'List matching papers/questions from Facts as bullets.',
  search: 'Summarize top Facts hits in 3–5 bullets.',
  explain: 'Explain the solution in short steps from Facts.',
  chitchat: 'Reply briefly.',
  clarify: 'Ask one short clarifying question.',
};

export function buildAnswerTurns(input: {
  intent: TutorIntent;
  message: string;
  evidence: string;
  memoryLines?: string[];
  graphLines?: string[];
  fullExplanation?: boolean;
}): TutorTurn[] {
  const system = input.intent === 'explain' ? EXPLAIN_SYSTEM : ANSWER_SYSTEM;
  const useExtras = input.intent === 'explain' || input.intent === 'search';
  const memory =
    useExtras &&
    input.memoryLines?.length &&
    `Memory:\n${input.memoryLines.map((line) => `- ${line}`).join('\n')}`;
  const graph =
    useExtras &&
    input.graphLines?.length &&
    `Graph:\n${input.graphLines.map((line) => `- ${line}`).join('\n')}`;
  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: [
        `Facts:\n${clipText(input.evidence, 1400) || '(none)'}`,
        memory || null,
        graph || null,
        `Student: ${clipText(input.message, 240)}`,
        INTENT_CLOSER[input.intent] || INTENT_CLOSER.catalogue,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}
