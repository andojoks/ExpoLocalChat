import { getApiBaseUrl } from '@/config/api';
import JSZip from 'jszip';
import type { EmbeddingStatus } from './embedding';

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

const INSTALL_KEY = 'questionbankchat:model-install';
/** Full manifest cached at download time — getModelState never re-fetches when installed. */
const MANIFEST_KEY = 'questionbankchat:embedding-manifest';
const CACHE = 'questionbankchat-embeddinggemma-v1';

export function validateManifest(value: unknown): value is ModelManifest {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.version === 'string' &&
    typeof m.archive === 'string' &&
    m.archive.endsWith('.zip') &&
    typeof m.archiveBytes === 'number' &&
    m.archiveBytes > 0 &&
    typeof m.entryPoint === 'string' &&
    m.entryPoint.indexOf('..') < 0
  );
}

async function fetchRemoteManifest() {
  const response = await fetch(`${getApiBaseUrl()}/models/embeddinggemma/onnx-manifest.json`);
  if (!response.ok) throw Error(`Manifest request failed (${response.status})`);
  const manifest: unknown = await response.json();
  if (!validateManifest(manifest) || manifest.mock) throw Error('Full model manifest required');
  return manifest;
}

function readLocalManifest(): ModelManifest | null {
  try {
    const raw = globalThis.localStorage?.getItem(MANIFEST_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return validateManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocalManifest(manifest: ModelManifest) {
  globalThis.localStorage?.setItem(MANIFEST_KEY, JSON.stringify(manifest));
  globalThis.localStorage?.setItem(INSTALL_KEY, installId(manifest));
}

const installId = (m: ModelManifest) => `${m.id}@${m.version}`;
const cacheUrl = (name: string) =>
  `${globalThis.location?.origin || 'https://questionbank.local'}/__models__/embeddinggemma/${name.replace(/^\.\//, '')}`;
const readyStatus = (): EmbeddingStatus => ({
  kind: 'ready',
  progress: 1,
  label: 'EmbeddingGemma 300M - full ONNX model ready',
});

/** Prefer the cached manifest + Cache Storage; only hit the server when not installed. */
export async function getModelState(): Promise<{
  status: EmbeddingStatus;
  path?: string;
  manifest?: ModelManifest;
}> {
  const local = readLocalManifest();
  if (local) {
    try {
      const cache = await caches.open(CACHE);
      const entry = await cache.match(cacheUrl(local.entryPoint));
      const saved = globalThis.localStorage?.getItem(INSTALL_KEY);
      if (saved === installId(local) && entry) {
        return { status: readyStatus(), path: cacheUrl(local.entryPoint), manifest: local };
      }
    } catch {
      // fall through
    }
  }

  try {
    const manifest = await fetchRemoteManifest();
    return {
      status: {
        kind: 'missing',
        progress: 0,
        label: `Download ${(manifest.archiveBytes / 1e6).toFixed(0)} MB model ZIP`,
      },
      manifest,
    };
  } catch {
    return {
      status: {
        kind: 'missing',
        progress: 0,
        label: local
          ? 'Cached embedding model incomplete — re-download while online'
          : 'Download models (model server required once)',
      },
      manifest: local || undefined,
    };
  }
}

export async function downloadModel(onProgress: (s: EmbeddingStatus) => void) {
  const manifest = await fetchRemoteManifest();
  onProgress({
    kind: 'downloading',
    progress: 0.02,
    label: `Downloading full model ZIP - ${(manifest.archiveBytes / 1e6).toFixed(0)} MB`,
  });
  const archiveUrl =
    manifest.downloadUrl?.trim() ||
    `${getApiBaseUrl()}/models/embeddinggemma/${manifest.archive}`;
  const response = await fetch(archiveUrl);
  if (!response.ok) throw Error(`Archive request failed (${response.status})`);
  const reader = response.body?.getReader();
  let received = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        onProgress({
          kind: 'downloading',
          progress: Math.min(0.7, (0.7 * received) / manifest.archiveBytes),
          label: `Downloading ${Math.round((100 * received) / manifest.archiveBytes)}%`,
        });
      }
    }
  }
  const archive = reader ? concat(chunks, received) : new Uint8Array(await response.arrayBuffer());
  onProgress({
    kind: 'downloading',
    progress: 0.72,
    label: 'Unpacking model into browser storage...',
  });
  const zip = await JSZip.loadAsync(archive, { checkCRC32: true }),
    files = Object.values(zip.files).filter((file) => !file.dir),
    cache = await caches.open(CACHE);
  await caches.delete(`${CACHE}-old`);
  for (let i = 0; i < files.length; i++) {
    const file = files[i],
      safeName = file.name.replace(/\\/g, '/').replace(/^\.\//, '');
    if (safeName.startsWith('/') || safeName.split('/').indexOf('..') >= 0)
      throw Error('Unsafe ZIP entry');
    const bytes = await file.async('uint8array');
    await cache.put(
      cacheUrl(safeName),
      new Response(new Uint8Array(bytes).buffer, {
        headers: {
          'Content-Type': contentType(safeName),
          'Content-Length': String(bytes.byteLength),
        },
      }),
    );
    onProgress({
      kind: 'downloading',
      progress: 0.72 + (0.28 * (i + 1)) / files.length,
      label: `Installing model files ${i + 1}/${files.length}`,
    });
  }
  const entry = await cache.match(cacheUrl(manifest.entryPoint));
  if (!entry) throw Error(`ZIP did not contain ${manifest.entryPoint}`);
  writeLocalManifest(manifest);
  onProgress(readyStatus());
  return { path: cacheUrl(manifest.entryPoint), manifest };
}

function concat(chunks: Uint8Array[], length: number) {
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function contentType(name: string) {
  if (name.endsWith('.json')) return 'application/json';
  if (name.endsWith('.onnx')) return 'application/octet-stream';
  return 'application/octet-stream';
}
