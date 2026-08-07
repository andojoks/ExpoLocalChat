export const TOOL_NAMES = [
  'list_exam_categories',
  'list_subjects',
  'list_exam_years',
  'list_papers',
  'list_sections',
  'list_exam_questions',
  'get_question_details',
  'search_exam_bank',
  'search_conversation_memory',
] as const;

export type QuestionToolName = (typeof TOOL_NAMES)[number];
