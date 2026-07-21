import type { AgentContext } from '@/domain/types';
import type { QuestionToolKey } from './tools';

/** True when the student is likely asking about the question bank (not small talk). */
export function looksLikeExamQuery(message: string, context: AgentContext): boolean {
  const text = message.toLowerCase().trim();
  if (!text) return false;
  if (/^(hi|hello|hey|thanks|thank you|who are you|what can you do)\b/.test(text)) return false;
  if (context.activeQuestionId || context.lastTool || context.subject || context.year) return true;
  return (
    /\b(20\d{2}|paper|question|exam|gce|o\s*level|a\s*level|ol\b|al\b|math|bio|physics|chem|topic|subject|catalogue|available|present|list|show|find|search|explain|answer|hint|osmosis|algebra|mechanics)\b/i.test(
      text,
    ) || text.length > 40
  );
}

/** Deterministic fallback when the LLM tries to finish without gathering DB evidence. */
export function bootstrapExamTool(
  message: string,
  context: AgentContext,
): {
  action: 'tool';
  tool: QuestionToolKey;
  arguments: Record<string, unknown>;
  goal: string;
} {
  const text = message.toLowerCase();

  if (
    context.activeQuestionId &&
    /\b(explain|answer|hint|solution|detail|that|this|it)\b/.test(text)
  ) {
    return {
      action: 'tool',
      tool: 'getQuestionDetails',
      arguments: { id: context.activeQuestionId },
      goal: 'forced question details',
    };
  }

  if (/\b(next page|previous page|prev page)\b/.test(text) && context.lastArguments) {
    const delta = /\bprevious|prev\b/.test(text) ? -1 : 1;
    const page = Math.max(1, (Number(context.page) || 1) + delta);
    const tool: QuestionToolKey =
      context.lastTool === 'retrieveQuestions' ? 'retrieveQuestions' : 'listQuestions';
    return {
      action: 'tool',
      tool,
      arguments: { ...context.lastArguments, page },
      goal: 'forced pagination',
    };
  }

  if (/\b(available|present|catalogue|what years|which subjects|do you have)\b/.test(text)) {
    return {
      action: 'tool',
      tool: 'inspectCatalogue',
      // Discovery should not inherit stale subject/topic from prior turns.
      arguments: filtersFromMessageOnly(message),
      goal: 'forced catalogue inspect',
    };
  }

  if (/\b(20\d{2}|list|show|paper\s*[123]|all questions)\b/.test(text)) {
    return {
      action: 'tool',
      tool: 'listQuestions',
      arguments: { ...filtersFromMessage(message, context), page: 1, pageSize: 5 },
      goal: 'forced list',
    };
  }

  return {
    action: 'tool',
    tool: 'retrieveQuestions',
    arguments: {
      query: message,
      ...filtersFromMessage(message, context),
      page: 1,
      pageSize: 5,
    },
    goal: 'forced semantic search',
  };
}

/** Filters mentioned in the current message only (safe for catalogue inspect). */
function filtersFromMessageOnly(message: string) {
  const yearMatch = message.match(/\b(20\d{2})\b/);
  const paperMatch = message.match(/\bpaper\s*([123])\b/i);
  const category = /\bo\s*level\b|\bol\b/i.test(message)
    ? 'OL'
    : /\ba\s*level\b|\bal\b/i.test(message)
      ? 'AL'
      : undefined;
  const subject = inferSubjectPhrase(message);
  return {
    ...(yearMatch ? { year: Number(yearMatch[1]) } : {}),
    ...(paperMatch ? { paper: Number(paperMatch[1]) } : {}),
    ...(category ? { category } : {}),
    ...(subject ? { subject } : {}),
  };
}

function filtersFromMessage(message: string, context: AgentContext) {
  const fromMessage = filtersFromMessageOnly(message);
  return {
    year: fromMessage.year ?? context.year,
    paper: fromMessage.paper,
    subject: fromMessage.subject ?? context.subject,
    topic: context.topic,
    category: fromMessage.category ?? context.category,
  };
}

function inferSubjectPhrase(message: string) {
  if (/\bmath/.test(message.toLowerCase())) return 'math';
  if (/\bbio/.test(message.toLowerCase())) return 'biology';
  if (/\bphys/.test(message.toLowerCase())) return 'physics';
  if (/\bchem/.test(message.toLowerCase())) return 'chemistry';
  return undefined;
}
