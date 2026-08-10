import type { SQLiteDatabase } from 'expo-sqlite';
import {
  decryptPackJson,
  downloadPackBytes,
  getPackDetail,
} from '@/packs/catalog-client';
import { importExamPackFromJson, removeInstalledPack } from '@/packs/import-pack';
import { installKey } from '@/packs/pack-utils';
import type { CatalogPack } from '@/packs/types';
import { getAutodownloadPackImages } from '@/preferences/pack-images';

export type PackInstallPhase = 'fetching' | 'downloading' | 'storing' | 'removing';

export type PackInstallJob = {
  key: string;
  phase: PackInstallPhase;
  /** 0–1 while downloading when total is known; otherwise asymptotic. */
  progress: number;
  /** Human label for the row. */
  label: string;
  error?: string;
};

type Listener = () => void;

const jobs = new Map<string, PackInstallJob>();
const listeners = new Set<Listener>();
/** Bumped on every change so useSyncExternalStore sees a new snapshot. */
let jobsVersion = 0;

function emit() {
  jobsVersion += 1;
  for (const l of listeners) l();
}

function setJob(job: PackInstallJob) {
  jobs.set(job.key, { ...job });
  emit();
}

function clearJob(key: string) {
  if (!jobs.delete(key)) return;
  emit();
}

export function getPackInstallJobsVersion(): number {
  return jobsVersion;
}

export function getPackInstallJob(key: string): PackInstallJob | undefined {
  const j = jobs.get(key);
  return j ? { ...j } : undefined;
}

export function subscribePackInstallJobs(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True if any year pack for this course is installing. */
export function courseHasActiveInstall(
  categoryCode: string,
  subjectCode: string,
): boolean {
  const prefix = `${categoryCode}:${subjectCode}:`;
  for (const [key, job] of jobs) {
    if (key.startsWith(prefix) && !job.error) return true;
  }
  return false;
}

export async function runPackInstall(
  db: SQLiteDatabase,
  pack: CatalogPack,
): Promise<void> {
  const key = installKey({
    categoryCode: pack.category.code,
    subjectCode: pack.subject.code,
    year: pack.year,
  });
  if (jobs.has(key) && !jobs.get(key)?.error) return;

  const label = `${pack.subject.code} ${pack.year}`;
  setJob({ key, phase: 'fetching', progress: 0, label });

  try {
    let downloadUrl = pack.downloadUrl?.trim() || '';
    if (!downloadUrl) {
      const detail = await getPackDetail(
        pack.subject.code,
        pack.year,
        pack.category.code,
      );
      downloadUrl = detail.downloadUrl?.trim() || '';
    }
    if (!downloadUrl) throw new Error('Pack has no download URL');

    setJob({ key, phase: 'downloading', progress: 0, label });
    let lastProgressAt = 0;
    const bytes = await downloadPackBytes(downloadUrl, {
      expectedBytes: pack.sizeBytes ?? null,
      onProgress: (p) => {
        const progress =
          p.ratio != null
            ? p.ratio
            : Math.min(0.92, p.loaded / (p.loaded + 750_000));
        const now = Date.now();
        if (progress < 0.99 && now - lastProgressAt < 100) return;
        lastProgressAt = now;
        setJob({
          key,
          phase: 'downloading',
          progress,
          label,
        });
      },
    });

    setJob({ key, phase: 'storing', progress: 1, label });
    const body = await decryptPackJson(bytes);
    const prefetchImages = await getAutodownloadPackImages();
    await importExamPackFromJson(db, body, pack.checksumSha256, { prefetchImages });
    clearJob(key);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Install failed';
    setJob({ key, phase: 'fetching', progress: 0, label, error: message });
    setTimeout(() => {
      const cur = jobs.get(key);
      if (cur?.error === message) clearJob(key);
    }, 4000);
    throw e;
  }
}

export async function runPackRemove(
  db: SQLiteDatabase,
  pack: Pick<CatalogPack, 'category' | 'subject' | 'year'>,
): Promise<void> {
  const key = installKey({
    categoryCode: pack.category.code,
    subjectCode: pack.subject.code,
    year: pack.year,
  });
  if (jobs.has(key) && !jobs.get(key)?.error) return;

  const label = `${pack.subject.code} ${pack.year}`;
  setJob({ key, phase: 'removing', progress: 0, label });
  try {
    await removeInstalledPack(db, pack.category.code, pack.subject.code, pack.year);
    clearJob(key);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Remove failed';
    setJob({ key, phase: 'removing', progress: 0, label, error: message });
    setTimeout(() => {
      const cur = jobs.get(key);
      if (cur?.error === message) clearJob(key);
    }, 4000);
    throw e;
  }
}
