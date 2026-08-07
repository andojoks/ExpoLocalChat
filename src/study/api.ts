import { apiJson } from '@/api/http';

export type StudyQuestion = {
  id: string;
  numberLabel?: string;
  contentRenderedHtml: string;
  options: Array<{ id: string; renderedHtml: string; isCorrect?: boolean }>;
  solutions?: Array<{ id: string; stepsRenderedHtml: string; method?: string }>;
  children?: StudyQuestion[];
};

/** Portable study client — HTML questions from Next study APIs. */
export async function fetchStudyQuestions(paperId: string, sectionId?: string) {
  const qs = new URLSearchParams({ examPaperId: paperId });
  if (sectionId) qs.set('examPaperSectionId', sectionId);
  const data = await apiJson<{ data: StudyQuestion[] }>(`/api/study/questions?${qs}`);
  return data.data || [];
}

export async function fetchStudyCatalog() {
  return apiJson(`/api/study/catalog`);
}

export async function fetchCoursePapers(subjectCode: string, category?: string, year?: number) {
  const qs = new URLSearchParams();
  if (category) qs.set('category', category);
  if (year) qs.set('year', String(year));
  const q = qs.toString();
  return apiJson(
    `/api/study/courses/${encodeURIComponent(subjectCode)}${q ? `?${q}` : ''}`,
  );
}
