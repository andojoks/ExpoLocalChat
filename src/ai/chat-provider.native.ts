import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { initLlama, type LlamaContext } from 'llama.rn';
import type { ChatModel, GenerationOptions, TutorTurn } from './chat-model';
import { getApiBaseUrl } from '@/config/api';

/** SmolLM2-135M Q4_0 — small on-device tutor; OpenCL-friendly quant. */
const FILE = 'SmolLM2-135M.Q4_0.gguf';
const MODEL_ROUTE = 'smollm2-function';
const MODEL_DIR = `${FileSystem.documentDirectory}models/`;
const PATH = `${MODEL_DIR}${FILE}`;
/** Cached at download time — chat init never fetches the remote manifest. */
const LOCAL_MANIFEST_PATH = `${MODEL_DIR}smollm2-manifest.json`;
const DEFAULT_BYTES = 91726304;
/** Offload as many layers as fit; Metal (iOS) / OpenCL+Hexagon (Android when supported). */
const N_GPU_LAYERS = 99;

export type ChatManifest = { file: string; bytes: number; available: boolean };

export type ChatGpuBackend = 'opencl' | 'hexagon' | 'metal' | 'cpu';

export type ChatGpuStatus = {
  enabled: boolean;
  backend: ChatGpuBackend;
  reason?: string;
  devices?: unknown;
};

export type ChatModelInstallStatus = {
  installed: boolean;
  label: string;
  bytes?: number;
};

let lastGpuStatus: ChatGpuStatus | null = null;
let loggedDeviceOnce = false;

export function getChatGpuStatus(): ChatGpuStatus | null {
  return lastGpuStatus;
}

/** Local-only: whether GGUF + cached manifest are ready (no network). */
export async function getChatModelInstallState(): Promise<ChatModelInstallStatus> {
  const manifest = await readLocalChatManifest();
  if (!manifest) {
    return { installed: false, label: 'Chat model not downloaded' };
  }
  return {
    installed: true,
    label: 'Chat model ready',
    bytes: manifest.bytes,
  };
}

/**
 * Fetch remote manifest + GGUF once, then persist both on device.
 * After this succeeds, chat init never contacts the model server.
 */
export async function downloadChatModel(
  onProgress?: (label: string, progress: number) => void,
): Promise<ChatManifest> {
  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
  onProgress?.('Fetching chat model manifest…', 0.05);
  const manifest = await fetchRemoteChatManifest();
  onProgress?.('Downloading chat model…', 0.1);
  await downloadGguf(manifest, onProgress);
  await writeLocalChatManifest(manifest);
  onProgress?.('Chat model ready', 1);
  return manifest;
}

export function createChatModel(): ChatModel {
  let context: LlamaContext | undefined, loading: Promise<void> | undefined;
  return {
    name: 'SmolLM2-135M Q4_0 - llama.rn',
    async initialize() {
      if (context) return;
      if (loading) return loading;
      loading = (async () => {
        try {
          await logDeviceOnce();
          await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
          const manifest = await readLocalChatManifest();
          if (!manifest) {
            throw Error(
              'Chat model is not installed on this device. Connect once and tap Download models, then airplane mode works.',
            );
          }
          context = await loadWithGpuPreference();
        } catch (error) {
          loading = undefined;
          throw error;
        }
      })();
      return loading;
    },
    async generate(turns: TutorTurn[], onToken, options: GenerationOptions = {}) {
      await this.initialize();
      if (!context) throw Error('Native chat model did not initialize');
      let raw = '';
      const response = await context.completion(
        {
          messages: turns,
          n_predict: options.maxTokens || 384,
          temperature: options.temperature ?? 0.25,
          top_p: 0.85,
          top_k: 30,
          penalty_repeat: 1.08,
          stop: ['<|im_end|>', '<|endoftext|>'],
          response_format: options.jsonSchema
            ? { type: 'json_schema', json_schema: { strict: true, schema: options.jsonSchema } }
            : undefined,
        },
        (data) => {
          if (!data.token) return;
          raw += data.token;
          onToken?.(data.token);
        },
      );
      return (response.text || raw).trim();
    },
  };
}

async function loadWithGpuPreference(): Promise<LlamaContext> {
  const base = {
    model: PATH,
    n_ctx: 2048,
    n_batch: 256,
    n_ubatch: 128,
    n_gpu_layers: N_GPU_LAYERS,
    use_mmap: true,
    ...(Platform.OS === 'android' ? { flash_attn_type: 'off' as const } : {}),
  };

  let ctx = await initLlama(base);
  if (ctx.gpu || Platform.OS !== 'android') {
    persistGpuStatus(ctx, ctx.gpu ? inferBackend(ctx) : 'cpu');
    return ctx;
  }

  const openClReason = ctx.reasonNoGPU || 'GPU backend is not available';
  console.log(`[chat] OpenCL unavailable, trying Hexagon HTP0: ${openClReason}`);
  try {
    await ctx.release();
  } catch {
    // ignore
  }

  try {
    ctx = await initLlama({ ...base, devices: ['HTP0'] });
  } catch (error) {
    console.log(`[chat] Hexagon init failed, falling back to CPU: ${String(error)}`);
    ctx = await initLlama({ ...base, n_gpu_layers: 0 });
    persistGpuStatus(ctx, 'cpu', openClReason);
    return ctx;
  }

  if (ctx.gpu) {
    persistGpuStatus(ctx, 'hexagon');
    return ctx;
  }

  persistGpuStatus(ctx, 'cpu', ctx.reasonNoGPU || openClReason);
  return ctx;
}

function persistGpuStatus(ctx: LlamaContext, backend: ChatGpuBackend, reasonOverride?: string) {
  const enabled = !!ctx.gpu && backend !== 'cpu';
  lastGpuStatus = {
    enabled,
    backend: enabled ? backend : 'cpu',
    reason: enabled ? undefined : reasonOverride || ctx.reasonNoGPU || undefined,
    devices: ctx.devices,
  };
  if (enabled) {
    console.log(
      `[chat] ${backend.toUpperCase()} enabled (${Platform.OS}); devices=${JSON.stringify(ctx.devices)}`,
    );
  } else if (Platform.OS === 'android') {
    console.warn(
      `[chat] GPU/NPU unavailable (${Platform.OS}): ${lastGpuStatus.reason || 'unknown'} — using CPU.`,
    );
  } else {
    console.log(`[chat] GPU unavailable (${Platform.OS}): ${lastGpuStatus.reason || 'unknown'}`);
  }
}

function inferBackend(ctx: LlamaContext): ChatGpuBackend {
  if (Platform.OS === 'ios') return 'metal';
  const devices = JSON.stringify(ctx.devices ?? '').toUpperCase();
  if (devices.includes('HTP') || devices.includes('HEXAGON')) return 'hexagon';
  return 'opencl';
}

async function logDeviceOnce() {
  if (loggedDeviceOnce) return;
  loggedDeviceOnce = true;
  console.log(
    `[chat] device brand=${Device.brand} model=${Device.modelName} manufacturer=${Device.manufacturer} arch=${JSON.stringify(Device.supportedCpuArchitectures)}`,
  );
}

function isChatManifest(value: unknown): value is ChatManifest {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return m.file === FILE && typeof m.bytes === 'number' && m.bytes > 0 && m.available === true;
}

/** Read cached manifest and verify the on-device GGUF matches — never hits the network. */
async function readLocalChatManifest(): Promise<ChatManifest | null> {
  try {
    const info = await FileSystem.getInfoAsync(LOCAL_MANIFEST_PATH);
    if (info.exists) {
      const raw = await FileSystem.readAsStringAsync(LOCAL_MANIFEST_PATH);
      const parsed: unknown = JSON.parse(raw);
      if (isChatManifest(parsed)) {
        const gguf = await FileSystem.getInfoAsync(PATH);
        if (gguf.exists && 'size' in gguf && gguf.size === parsed.bytes) return parsed;
      }
    }
  } catch {
    // fall through to migrate path
  }

  // Migrate older installs that have the GGUF but no cached manifest.
  const gguf = await FileSystem.getInfoAsync(PATH);
  const bytes =
    gguf.exists && 'size' in gguf && typeof gguf.size === 'number' ? gguf.size : 0;
  if (bytes < 1_000_000) return null;
  const migrated: ChatManifest = {
    file: FILE,
    bytes: bytes === DEFAULT_BYTES ? DEFAULT_BYTES : bytes,
    available: true,
  };
  await writeLocalChatManifest(migrated);
  return migrated;
}

async function writeLocalChatManifest(manifest: ChatManifest) {
  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
  await FileSystem.writeAsStringAsync(LOCAL_MANIFEST_PATH, JSON.stringify(manifest));
}

async function fetchRemoteChatManifest(): Promise<ChatManifest> {
  if (process.env.EXPO_PUBLIC_CHAT_MODEL_URL) {
    return { file: FILE, bytes: DEFAULT_BYTES, available: true };
  }
  const response = await fetch(`${getApiBaseUrl()}/models/${MODEL_ROUTE}/manifest.json`);
  if (!response.ok) throw Error(`Chat model manifest failed (${response.status})`);
  const manifest = (await response.json()) as Partial<ChatManifest>;
  if (manifest.file !== FILE || !manifest.available || !manifest.bytes) {
    throw Error('SmolLM2 chat model is not available on the model server');
  }
  return { file: FILE, bytes: manifest.bytes, available: true };
}

async function downloadGguf(
  manifest: ChatManifest,
  onProgress?: (label: string, progress: number) => void,
) {
  const info = await FileSystem.getInfoAsync(PATH);
  if (info.exists && 'size' in info && info.size === manifest.bytes) return;

  if (info.exists) await FileSystem.deleteAsync(PATH, { idempotent: true });
  for (const legacy of [
    'qwen2.5-0.5b-instruct-q4_0.gguf',
    'qwen2.5-0.5b-instruct-q4_k_m.gguf',
  ]) {
    await FileSystem.deleteAsync(`${MODEL_DIR}${legacy}`, { idempotent: true });
  }

  const url =
    process.env.EXPO_PUBLIC_CHAT_MODEL_URL || `${getApiBaseUrl()}/models/${MODEL_ROUTE}/${FILE}`;

  // Prefer resumable download for progress when available.
  if (typeof FileSystem.createDownloadResumable === 'function') {
    const task = FileSystem.createDownloadResumable(
      url,
      PATH,
      {},
      (p) => {
        const total = Math.max(p.totalBytesExpectedToWrite || manifest.bytes, 1);
        const fraction = Math.min(0.95, 0.1 + 0.85 * (p.totalBytesWritten / total));
        onProgress?.(
          `Downloading chat model ${Math.round((100 * p.totalBytesWritten) / total)}%`,
          fraction,
        );
      },
    );
    const result = await task.downloadAsync();
    if (!result || result.status < 200 || result.status >= 300) {
      await FileSystem.deleteAsync(PATH, { idempotent: true });
      throw Error(`Chat model download failed (${result?.status ?? 'no result'})`);
    }
  } else {
    onProgress?.('Downloading chat model…', 0.4);
    let result: { status: number };
    try {
      result = await FileSystem.downloadAsync(url, PATH);
    } catch (error) {
      await FileSystem.deleteAsync(PATH, { idempotent: true });
      throw Error(
        `Chat model download failed (offline or cannot reach ${getApiBaseUrl()}): ${String(error)}`,
      );
    }
    if (result.status < 200 || result.status >= 300) {
      await FileSystem.deleteAsync(PATH, { idempotent: true });
      throw Error(`Chat model download failed (${result.status})`);
    }
  }

  const downloaded = await FileSystem.getInfoAsync(PATH);
  if (!downloaded.exists || !('size' in downloaded) || downloaded.size !== manifest.bytes) {
    await FileSystem.deleteAsync(PATH, { idempotent: true });
    throw Error(`Chat model download incomplete. Expected ${manifest.bytes} bytes.`);
  }
}
