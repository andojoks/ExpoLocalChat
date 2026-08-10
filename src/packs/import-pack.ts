import type { SQLiteDatabase } from 'expo-sqlite';
import type { ExamPackV1, InstalledPack } from '@/packs/types';
import { sha256Hex } from '@/packs/checksum';
import {
  cacheAndRewriteHtml,
  collectContentAddressedUrls,
  ensureAssetCached,
  type AssetCacheStats,
  countUnresolvedElAssetRefs,
} from '@/packs/asset-cache';
import { getContentOwnerUserId } from '@/auth/content-owner';

function packId(categoryCode: string, subjectCode: string, year: number, paperNumber?: number) {
  const base = `pack:${categoryCode}:${subjectCode}:${year}`;
  return paperNumber == null ? base : `${base}:p${paperNumber}`;
}

function optionRenderedHtmls(options: ExamPackV1['papers'][0]['questions'][0]['options']): string[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((o) => (o && typeof o === 'object' ? String((o as { renderedHtml?: string }).renderedHtml || '') : ''))
    .filter(Boolean);
}

async function rewriteQuestionHtml(
  q: {
    promptRenderedHtml?: string;
    answerRenderedHtml?: string;
    solutionRenderedHtml?: string;
    options?: ExamPackV1['papers'][0]['questions'][0]['options'];
  },
  prefetchImages: boolean,
): Promise<{
  promptHtml: string;
  answerHtml: string;
  solutionHtml: string;
  optionsJson: string;
}> {
  const rewrite = async (html: string) =>
    prefetchImages ? cacheAndRewriteHtml(html) : html || '';

  const promptHtml = await rewrite(q.promptRenderedHtml || '');
  const answerHtml = await rewrite(q.answerRenderedHtml || '');
  const solutionHtml = await rewrite(q.solutionRenderedHtml || '');

  let options = q.options || [];
  if (Array.isArray(options)) {
    const next = [];
    for (const o of options) {
      if (o && typeof o === 'object' && (o as { renderedHtml?: string }).renderedHtml) {
        const renderedHtml = await rewrite(String((o as { renderedHtml?: string }).renderedHtml));
        next.push({ ...o, renderedHtml });
      } else {
        next.push(o);
      }
    }
    options = next;
  }

  return {
    promptHtml,
    answerHtml,
    solutionHtml,
    optionsJson: JSON.stringify(options),
  };
}

export async function ensureInstalledPacksTable(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS installed_packs(
      category_code TEXT NOT NULL,
      subject_code TEXT NOT NULL,
      year INTEGER NOT NULL,
      version TEXT NOT NULL,
      checksum TEXT NOT NULL,
      installed_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'installed',
      owner_user_id TEXT,
      PRIMARY KEY(category_code, subject_code, year)
    );
  `);
  try {
    await db.execAsync(`ALTER TABLE installed_packs ADD COLUMN owner_user_id TEXT;`);
  } catch {
    /* already exists */
  }
}

export async function listInstalledPacks(db: SQLiteDatabase): Promise<InstalledPack[]> {
  await ensureInstalledPacksTable(db);
  const rows = await db.getAllAsync<{
    category_code: string;
    subject_code: string;
    year: number;
    version: string;
    checksum: string;
    installed_at: number;
    status: string;
    owner_user_id: string | null;
  }>('SELECT * FROM installed_packs ORDER BY category_code, subject_code, year DESC');
  return rows.map((r) => ({
    categoryCode: r.category_code,
    subjectCode: r.subject_code,
    year: r.year,
    version: r.version,
    checksum: r.checksum,
    installedAt: r.installed_at,
    status: r.status,
    ownerUserId: r.owner_user_id,
  }));
}

export async function getInstalledPack(
  db: SQLiteDatabase,
  categoryCode: string,
  subjectCode: string,
  year: number,
): Promise<InstalledPack | null> {
  await ensureInstalledPacksTable(db);
  const row = await db.getFirstAsync<{
    category_code: string;
    subject_code: string;
    year: number;
    version: string;
    checksum: string;
    installed_at: number;
    status: string;
    owner_user_id: string | null;
  }>(
    `SELECT * FROM installed_packs WHERE category_code=? AND subject_code=? AND year=?`,
    categoryCode,
    subjectCode,
    year,
  );
  if (!row) return null;
  return {
    categoryCode: row.category_code,
    subjectCode: row.subject_code,
    year: row.year,
    version: row.version,
    checksum: row.checksum,
    installedAt: row.installed_at,
    status: row.status,
    ownerUserId: row.owner_user_id,
  };
}

/** Remove local exam content for a subject+year pack and the install record. */
export async function removeInstalledPack(
  db: SQLiteDatabase,
  categoryCode: string,
  subjectCode: string,
  year: number,
) {
  await ensureInstalledPacksTable(db);
  const subject = await db.getFirstAsync<{ id: string }>(
    `SELECT s.id FROM subjects s
     JOIN exam_categories c ON c.id = s.category_id
     WHERE c.code=? AND s.code=?`,
    categoryCode,
    subjectCode,
  );
  if (subject?.id) {
    const papers = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM exam_papers WHERE subject_id=? AND year=?`,
      subject.id,
      year,
    );
    for (const paper of papers) {
      const qids = await db.getAllAsync<{ question_id: string }>(
        `SELECT question_id FROM paper_questions WHERE paper_id=?`,
        paper.id,
      );
      await db.runAsync(`DELETE FROM paper_questions WHERE paper_id=?`, paper.id);
      await db.runAsync(`DELETE FROM paper_sections WHERE paper_id=?`, paper.id);
      for (const q of qids) {
        await db.runAsync(`DELETE FROM exam_questions WHERE parent_question_id=?`, q.question_id);
        await db.runAsync(`DELETE FROM exam_questions WHERE id=?`, q.question_id);
      }
      await db.runAsync(`DELETE FROM exam_papers WHERE id=?`, paper.id);
    }
  }
  await db.runAsync(
    `DELETE FROM installed_packs WHERE category_code=? AND subject_code=? AND year=?`,
    categoryCode,
    subjectCode,
    year,
  );
}

export async function importExamPackFromJson(
  db: SQLiteDatabase,
  body: string,
  expectedChecksum: string,
  opts?: { prefetchImages?: boolean },
): Promise<InstalledPack & { assetStats?: AssetCacheStats }> {
  const prefetchImages = opts?.prefetchImages !== false;
  await ensureInstalledPacksTable(db);
  if (!body?.trim()) {
    throw new Error('Pack body is empty — download may have failed');
  }
  const digest = await sha256Hex(body);
  if (expectedChecksum && digest !== expectedChecksum) {
    throw new Error('Pack checksum mismatch — download may be corrupt');
  }

  let pack: ExamPackV1;
  try {
    pack = JSON.parse(body) as ExamPackV1;
  } catch {
    throw new Error('Pack JSON is invalid — re-publish the pack from admin');
  }
  if (pack.schema !== 'exam-pack-v1') {
    throw new Error(`Unsupported pack schema: ${String((pack as { schema?: string }).schema)}`);
  }

  const categoryCode = pack.category.code;
  const subjectCode = pack.subject.code;
  const year = pack.year;
  const now = Date.now();

  const htmlPool: string[] = [];
  for (const paper of pack.papers) {
    for (const q of paper.questions) {
      if (q.promptRenderedHtml) htmlPool.push(q.promptRenderedHtml);
      if (q.answerRenderedHtml) htmlPool.push(q.answerRenderedHtml);
      if (q.solutionRenderedHtml) htmlPool.push(q.solutionRenderedHtml);
      htmlPool.push(...optionRenderedHtmls(q.options));
      for (const part of q.parts || []) {
        if (part.promptRenderedHtml) htmlPool.push(part.promptRenderedHtml);
        if (part.answerRenderedHtml) htmlPool.push(part.answerRenderedHtml);
        if (part.solutionRenderedHtml) htmlPool.push(part.solutionRenderedHtml);
      }
    }
  }
  const assetStats: AssetCacheStats = { scanned: 0, downloaded: 0, skipped: 0, failed: 0 };
  const unresolvedElAsset = countUnresolvedElAssetRefs(...htmlPool);
  if (unresolvedElAsset > 0) {
    assetStats.unresolvedElAsset = unresolvedElAsset;
    console.warn(
      `[import-pack] ${categoryCode}/${subjectCode}/${year}: ${unresolvedElAsset} unresolved el-asset:// ref(s) in HTML — republish packs after web el-asset rewrite`,
    );
  }
  if (prefetchImages) {
    const urls = collectContentAddressedUrls(...htmlPool);
    assetStats.scanned = urls.length;
    for (const url of urls) {
      try {
        const { downloaded } = await ensureAssetCached(url);
        if (downloaded) assetStats.downloaded += 1;
        else assetStats.skipped += 1;
      } catch {
        assetStats.failed += 1;
      }
    }
  } else {
    assetStats.scanned = collectContentAddressedUrls(...htmlPool).length;
  }

  await removeInstalledPack(db, categoryCode, subjectCode, year);

  const categoryId = `cat-${categoryCode}`;
  await db.runAsync(
    `INSERT OR REPLACE INTO exam_categories(id,code,name,description_md,embedding_json,updated_at)
     VALUES(?,?,?,?,COALESCE((SELECT embedding_json FROM exam_categories WHERE id=?),NULL),?)`,
    categoryId,
    categoryCode,
    pack.category.name,
    pack.category.descriptionMd || '',
    categoryId,
    now,
  );

  const subjectId = `sub-${categoryCode}-${subjectCode}`;
  await db.runAsync(
    `INSERT OR REPLACE INTO subjects(id,category_id,code,name,description_md,embedding_json,updated_at)
     VALUES(?,?,?,?,?,COALESCE((SELECT embedding_json FROM subjects WHERE id=?),NULL),?)`,
    subjectId,
    categoryId,
    subjectCode,
    pack.subject.name,
    pack.subject.descriptionMd || '',
    subjectId,
    now,
  );

  for (const paper of pack.papers) {
    const paperId = packId(categoryCode, subjectCode, year, paper.paperNumber);
    await db.runAsync(
      `INSERT OR REPLACE INTO exam_papers(
         id,subject_id,year,paper_number,title,reference,duration_minutes,description_md,embedding_json,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,COALESCE((SELECT embedding_json FROM exam_papers WHERE id=?),NULL),?)`,
      paperId,
      subjectId,
      year,
      paper.paperNumber,
      paper.title || null,
      paper.reference || null,
      paper.durationMinutes ?? null,
      paper.descriptionMd || '',
      paperId,
      now,
    );

    const sectionMap = new Map<string, string>();
    for (const section of paper.sections || []) {
      const sectionId = `sec-${categoryCode}-${subjectCode}-${section.code}`;
      sectionMap.set(section.code, sectionId);
      await db.runAsync(
        `INSERT OR REPLACE INTO exam_sections(id,subject_id,code,name,description_md,embedding_json,updated_at)
         VALUES(?,?,?,?,?,COALESCE((SELECT embedding_json FROM exam_sections WHERE id=?),NULL),?)`,
        sectionId,
        subjectId,
        section.code,
        section.name,
        section.descriptionMd || '',
        sectionId,
        now,
      );
      await db.runAsync(
        `INSERT OR REPLACE INTO paper_sections(paper_id,section_id,sort_order) VALUES(?,?,?)`,
        paperId,
        sectionId,
        section.sortOrder ?? 0,
      );
    }

    let sort = 0;
    for (const q of paper.questions) {
      const qid = `${paperId}:q:${q.numberLabel}`;
      const html = await rewriteQuestionHtml(q, prefetchImages);
      await db.runAsync(
        `INSERT OR REPLACE INTO exam_questions(
           id,parent_question_id,number_label,topic,marks,duration_minutes,
           prompt_md,answer_md,solution_md,
           prompt_rendered_html,answer_rendered_html,solution_rendered_html,options_json,
           hints_json,tags_json,embedding_json,updated_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT embedding_json FROM exam_questions WHERE id=?),NULL),?)`,
        qid,
        null,
        q.numberLabel,
        q.topic || '',
        q.marks || 0,
        null,
        q.promptMd,
        q.answerMd || '',
        q.solutionMd || '',
        html.promptHtml,
        html.answerHtml,
        html.solutionHtml,
        html.optionsJson,
        JSON.stringify(q.hints || []),
        JSON.stringify(q.tags || []),
        qid,
        now,
      );
      const sectionId = q.sectionCode ? sectionMap.get(q.sectionCode) || null : null;
      await db.runAsync(
        `INSERT OR REPLACE INTO paper_questions(paper_id,question_id,section_id,sort_order) VALUES(?,?,?,?)`,
        paperId,
        qid,
        sectionId,
        sort,
      );
      sort += 1;

      for (const part of q.parts || []) {
        const pid = `${qid}:${part.numberLabel}`;
        const partHtml = await rewriteQuestionHtml(part, prefetchImages);
        await db.runAsync(
          `INSERT OR REPLACE INTO exam_questions(
             id,parent_question_id,number_label,topic,marks,duration_minutes,
             prompt_md,answer_md,solution_md,
             prompt_rendered_html,answer_rendered_html,solution_rendered_html,options_json,
             hints_json,tags_json,embedding_json,updated_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT embedding_json FROM exam_questions WHERE id=?),NULL),?)`,
          pid,
          qid,
          part.numberLabel,
          q.topic || '',
          part.marks || 0,
          null,
          part.promptMd,
          part.answerMd || '',
          part.solutionMd || '',
          partHtml.promptHtml,
          partHtml.answerHtml,
          partHtml.solutionHtml,
          partHtml.optionsJson,
          JSON.stringify(part.hints || []),
          JSON.stringify(part.tags || []),
          pid,
          now,
        );
        await db.runAsync(
          `INSERT OR REPLACE INTO paper_questions(paper_id,question_id,section_id,sort_order) VALUES(?,?,?,?)`,
          paperId,
          pid,
          sectionId,
          sort,
        );
        sort += 1;
      }
    }
  }

  const ownerUserId = (await getContentOwnerUserId()) || null;

  await db.runAsync(
    `INSERT OR REPLACE INTO installed_packs(category_code,subject_code,year,version,checksum,installed_at,status,owner_user_id)
     VALUES(?,?,?,?,?,?,?,?)`,
    categoryCode,
    subjectCode,
    year,
    pack.version,
    digest,
    now,
    'installed',
    ownerUserId,
  );

  return {
    categoryCode,
    subjectCode,
    year,
    version: pack.version,
    checksum: digest,
    installedAt: now,
    status: 'installed',
    ownerUserId,
    assetStats,
  };
}
