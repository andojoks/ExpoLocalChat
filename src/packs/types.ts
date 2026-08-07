export type CatalogPack = {
  id: string;
  channel: string;
  version: string;
  year: number;
  s3Key: string;
  checksumSha256: string;
  sizeBytes: number;
  changelog: string;
  updatedAt: string;
  category: { code: string; name: string };
  subject: { id: string; code: string; name: string };
  bundleId: string | null;
  status: string;
  contentSchema: string;
};

export type PackDetail = CatalogPack & {
  downloadUrl: string;
  expiresInSeconds: number;
};

export type ExamPackV1 = {
  schema: 'exam-pack-v1';
  subjectCode: string;
  year: number;
  version: string;
  category: { code: string; name: string; descriptionMd?: string };
  subject: { code: string; name: string; descriptionMd?: string };
  papers: Array<{
    paperNumber: number;
    title?: string | null;
    reference?: string | null;
    durationMinutes?: number | null;
    descriptionMd?: string;
    sections?: Array<{ code: string; name: string; descriptionMd?: string; sortOrder?: number }>;
    questions: Array<{
      numberLabel: string;
      topic: string;
      marks: number;
      questionType?: string;
      promptMd: string;
      answerMd: string;
      solutionMd: string;
      promptRenderedHtml?: string;
      answerRenderedHtml?: string;
      solutionRenderedHtml?: string;
      options?: Array<string | { text?: string; isCorrect?: boolean; renderedHtml?: string }>;
      correctAnswer?: string;
      hints: unknown[];
      tags: unknown[];
      sectionCode?: string | null;
      parts: Array<{
        numberLabel: string;
        marks: number;
        promptMd: string;
        answerMd: string;
        solutionMd: string;
        promptRenderedHtml?: string;
        answerRenderedHtml?: string;
        solutionRenderedHtml?: string;
        hints?: unknown[];
        tags?: unknown[];
      }>;
    }>;
  }>;
};

export type InstalledPack = {
  categoryCode: string;
  subjectCode: string;
  year: number;
  version: string;
  checksum: string;
  installedAt: number;
  status: string;
};
