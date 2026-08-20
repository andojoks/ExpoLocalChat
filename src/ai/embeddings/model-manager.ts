import { getApiBaseUrl } from '@/config/api';
import * as FileSystem from 'expo-file-system/legacy';
import { subscribe, unzip } from 'react-native-zip-archive';
import type { EmbeddingStatus } from './embedding';
import { downloadResumableFile } from '../resumable-download';

export type ModelManifest = {
  id: string;
  version: string;
  runtime: 'litert' | 'onnx';
  format: 'task' | 'tflite' | 'onnx';
  archive: string;
  archiveBytes: number;
  extractedBytes: number;
  entryPoint: string;
  sha256?: string;
  mock?: boolean;
  /** Public bucket URL — same pattern as pack downloads. */
  downloadUrl?: string;
};

const ROOT = `${FileSystem.documentDirectory}models/`;
const ARCHIVE_OK = /\.(zip|task|tflite)$/i;

function isZipArchive(name: string) {
  return name.toLowerCase().endsWith('.zip');
}

export function validateManifest(value: unknown): value is ModelManifest {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.version === 'string' &&
    typeof m.archive === 'string' &&
    ARCHIVE_OK.test(m.archive) &&
    typeof m.archiveBytes === 'number' &&
    m.archiveBytes > 0 &&
    typeof m.entryPoint === 'string' &&
    m.entryPoint.indexOf('..') < 0
  );
}

async function fetchManifest() {
  const response = await fetch(`${getApiBaseUrl()}/models/embeddinggemma/manifest.json`);
  if (!response.ok) throw Error(`Manifest request failed (${response.status})`);
  const manifest: unknown = await response.json();
  if (!validateManifest(manifest)) throw Error('Invalid embedding model manifest');
  return manifest;
}

const installDir = (m: ModelManifest) =>
  `${ROOT}${m.id.replace(/[^a-z0-9_-]/gi, '_')}-${m.version}/`;
const entryPath = (m: ModelManifest) => installDir(m) + m.entryPoint;

export async function getModelState(): Promise<{
  status: EmbeddingStatus;
  path?: string;
  manifest?: ModelManifest;
}> {
  try {
    const manifest = await fetchManifest(),
      path = entryPath(manifest),
      info = await FileSystem.getInfoAsync(path);
    return info.exists
      ? { status: readyStatus(manifest), path, manifest }
      : {
          status: {
            kind: 'missing',
            progress: 0,
            label: 'Ready when you are',
          },
          manifest,
        };
  } catch {
    return { status: { kind: 'missing', progress: 0, label: 'Download unavailable' } };
  }
}

export async function downloadModel(onProgress: (s: EmbeddingStatus) => void) {
  const manifest = await fetchManifest();
  await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true });
  const directory = installDir(manifest);
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const needsUnzip = isZipArchive(manifest.archive);
  const destPath = needsUnzip ? `${ROOT}${manifest.archive}` : entryPath(manifest);
  const archiveUrl =
    manifest.downloadUrl?.trim() ||
    `${getApiBaseUrl()}/models/embeddinggemma/${manifest.archive}`;
  const snapshotPath = `${ROOT}${manifest.archive}.download.json`;
  const existing = await FileSystem.getInfoAsync(entryPath(manifest));
  if (existing.exists) {
    onProgress(readyStatus(manifest));
    return { path: entryPath(manifest), manifest };
  }

  await downloadResumableFile({
    url: archiveUrl,
    dest: destPath,
    expectedBytes: manifest.archiveBytes,
    snapshotPath,
    onProgress(written, total, phase) {
      const pct = Math.round((100 * written) / Math.max(total, 1));
      const prefix =
        phase === 'resume'
          ? 'Resuming embedding model'
          : phase === 'retry'
            ? 'Retrying embedding model'
            : 'Embedding model';
      onProgress({
        kind: 'downloading',
        progress: Math.min(0.8, 0.8 * (written / Math.max(total, 1))),
        label: `${prefix} ${pct}%`,
      });
    },
  });

  if (needsUnzip) {
    onProgress({ kind: 'downloading', progress: 0.82, label: 'Unpacking embedding model…' });
    await extractZip(destPath, directory, (p) =>
      onProgress({
        kind: 'downloading',
        progress: 0.8 + p * 0.2,
        label: 'Unpacking embedding model…',
      }),
    );
    await FileSystem.deleteAsync(destPath, { idempotent: true });
  }

  const path = entryPath(manifest);
  if (!(await FileSystem.getInfoAsync(path)).exists) {
    throw Error(`Model file missing after install: ${manifest.entryPoint}`);
  }
  onProgress(readyStatus(manifest));
  return { path, manifest };
}

/** expo-file-system URIs → native filesystem paths for ZipInputStream / SSZipArchive. */
function toNativePath(uri: string) {
  return decodeURI(uri.replace(/^file:\/\//, '')).replace(/\/$/, '');
}

async function extractZip(uri: string, destination: string, progress: (value: number) => void) {
  const sourcePath = toNativePath(uri);
  const targetPath = toNativePath(destination);
  await FileSystem.makeDirectoryAsync(destination, { intermediates: true });
  progress(0.05);

  const sub = subscribe(({ progress: pct }) => {
    const ratio = typeof pct === 'number' ? Math.min(1, Math.max(0, pct)) : 0;
    progress(0.05 + ratio * 0.9);
  });

  try {
    await unzip(sourcePath, targetPath, 'UTF-8');
    progress(1);
  } finally {
    sub.remove();
  }
}

function readyStatus(manifest: ModelManifest): EmbeddingStatus {
  return {
    kind: manifest.mock ? 'fallback' : 'ready',
    progress: 1,
    label: 'Ready',
  };
}
