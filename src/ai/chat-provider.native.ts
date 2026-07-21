import * as FileSystem from 'expo-file-system/legacy';
import { initLlama, type LlamaContext } from 'llama.rn';
import type { ChatModel, GenerationOptions, TutorTurn } from './chat-model';
import { cleanGeneratedText, cleanTokenDelta } from './output-sanitizer';
import { getServerUrl } from '@/config/server-config';

const FILE = 'qwen2.5-0.5b-instruct-q4_k_m.gguf';
const MODEL_ROUTE = 'qwen2.5-0.5b-instruct';
const MODEL_DIR = `${FileSystem.documentDirectory}models/`;
const PATH = `${MODEL_DIR}${FILE}`;
const DEFAULT_BYTES = 491400032;

type ChatManifest = { file: string; bytes: number; available: boolean };

export function createChatModel(): ChatModel {
  let context: LlamaContext | undefined, loading: Promise<void> | undefined;
  return {
    name: 'Qwen2.5-0.5B-Instruct Q4_K_M - llama.rn',
    async initialize() {
      if (context) return;
      if (loading) return loading;
      loading = (async () => {
        await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
        const manifest = await getChatManifest();
        await ensureModelFile(manifest);
        context = await initLlama({
          model: PATH,
          n_ctx: 2048,
          n_batch: 128,
          n_ubatch: 64,
          n_gpu_layers: 0,
          use_mmap: true,
        });
      })();
      return loading;
    },
    async generate(turns: TutorTurn[], onToken, options: GenerationOptions = {}) {
      await this.initialize();
      if (!context) throw Error('Native chat model did not initialize');
      let raw = '',
        clean = '';
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
          const next = cleanTokenDelta(raw, clean, turns);
          clean = next.clean;
          if (next.delta) onToken?.(next.delta);
        },
      );
      return cleanGeneratedText(response.text || raw, turns);
    },
  };
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
