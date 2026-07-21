import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { initLlama, type LlamaContext } from 'llama.rn';
import type { ChatModel, GenerationOptions, TutorTurn } from './chat-model';
import { getServerUrl } from '@/config/server-config';

/** Q4_0 is required for llama.rn Android OpenCL (Q4_K_M is CPU-only there). */
const FILE = 'qwen2.5-0.5b-instruct-q4_0.gguf';
const MODEL_ROUTE = 'qwen2.5-0.5b-instruct';
const MODEL_DIR = `${FileSystem.documentDirectory}models/`;
const PATH = `${MODEL_DIR}${FILE}`;
const DEFAULT_BYTES = 428730208;
/** Offload as many layers as fit; Metal (iOS) / OpenCL+Hexagon (Android when supported). */
const N_GPU_LAYERS = 99;

type ChatManifest = { file: string; bytes: number; available: boolean };

export type ChatGpuBackend = 'opencl' | 'hexagon' | 'metal' | 'cpu';

export type ChatGpuStatus = {
  enabled: boolean;
  backend: ChatGpuBackend;
  reason?: string;
  devices?: unknown;
};

let lastGpuStatus: ChatGpuStatus | null = null;
let loggedDeviceOnce = false;

export function getChatGpuStatus(): ChatGpuStatus | null {
  return lastGpuStatus;
}

export function createChatModel(): ChatModel {
  let context: LlamaContext | undefined, loading: Promise<void> | undefined;
  return {
    name: 'Qwen2.5-0.5B-Instruct Q4_0 - llama.rn',
    async initialize() {
      if (context) return;
      if (loading) return loading;
      loading = (async () => {
        try {
          await logDeviceOnce();
          await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
          const manifest = await getChatManifest();
          await ensureModelFile(manifest);
          context = await loadWithGpuPreference();
        } catch (error) {
          // Allow a later prompt to retry after server/model fixes.
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
    // OpenCL is unstable with flash-attn / custom cache types on some Adreno devices.
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
    // ignore release errors before retry
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
      `[chat] GPU/NPU unavailable (${Platform.OS}): ${lastGpuStatus.reason || 'unknown'} — using CPU. Needs Adreno 700+ (OpenCL) or Snapdragon 8 Gen 1+ (Hexagon) and a native rebuild with OpenCL.`,
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

async function getChatManifest(): Promise<ChatManifest> {
  if (process.env.EXPO_PUBLIC_CHAT_MODEL_URL)
    return { file: FILE, bytes: DEFAULT_BYTES, available: true };
  const response = await fetch(`${getServerUrl()}/models/${MODEL_ROUTE}/manifest.json`);
  if (!response.ok) throw Error(`Chat model manifest failed (${response.status})`);
  const manifest = (await response.json()) as Partial<ChatManifest>;
  if (manifest.file !== FILE || !manifest.available || !manifest.bytes)
    throw Error('Qwen chat model is not available on the model server');
  return { file: FILE, bytes: manifest.bytes, available: true };
}

async function ensureModelFile(manifest: ChatManifest) {
  const info = await FileSystem.getInfoAsync(PATH);
  if (info.exists && 'size' in info && info.size === manifest.bytes) return;
  if (info.exists) await FileSystem.deleteAsync(PATH, { idempotent: true });
  // Drop legacy Q4_K_M if present so storage does not keep the wrong quant.
  const legacy = `${MODEL_DIR}qwen2.5-0.5b-instruct-q4_k_m.gguf`;
  await FileSystem.deleteAsync(legacy, { idempotent: true });
  const url =
    process.env.EXPO_PUBLIC_CHAT_MODEL_URL || `${getServerUrl()}/models/${MODEL_ROUTE}/${FILE}`;
  const result = await FileSystem.downloadAsync(url, PATH);
  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(PATH, { idempotent: true });
    throw Error(`Chat model download failed (${result.status})`);
  }
  const downloaded = await FileSystem.getInfoAsync(PATH);
  if (!downloaded.exists || !('size' in downloaded) || downloaded.size !== manifest.bytes) {
    await FileSystem.deleteAsync(PATH, { idempotent: true });
    throw Error(`Chat model download incomplete. Expected ${manifest.bytes} bytes.`);
  }
}
