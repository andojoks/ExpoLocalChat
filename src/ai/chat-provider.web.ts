import type { ChatModel, GenerationOptions, TutorTurn } from './chat-model';

/** Web falls back to a small Transformers.js model (GGUF is native-only). */
const MODEL = 'HuggingFaceTB/SmolLM2-135M-Instruct';
const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1';
const LOCAL_MANIFEST_KEY = 'questionbankchat:chat-manifest-web';

export type ChatManifest = { file: string; bytes: number; available: boolean };

type ChatModelInstallStatus = {
  installed: boolean;
  label: string;
  bytes?: number;
};

const runtimeImport = (url: string) =>
  (new Function('url', 'return import(url)') as (url: string) => Promise<any>)(url);

let transformers: any;
let sharedGenerator: any;
let downloadInFlight: Promise<ChatManifest> | undefined;

export function getChatGpuStatus() {
  return null;
}

/** Local-only: whether the cached chat manifest marks the model as installed. */
export async function getChatModelInstallState(): Promise<ChatModelInstallStatus> {
  const manifest = readLocalChatManifest();
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
 * Download / warm the Transformers.js chat model once and persist a local manifest.
 * Chat init afterward never fetches a remote manifest.
 */
export async function downloadChatModel(
  onProgress?: (label: string, progress: number) => void,
): Promise<ChatManifest> {
  if (downloadInFlight) return downloadInFlight;
  downloadInFlight = (async () => {
    try {
      onProgress?.('Loading chat runtime…', 0.1);
      transformers ||= await runtimeImport(CDN);
      preferBrowserCache(transformers);
      onProgress?.('Downloading chat model weights…', 0.35);
      sharedGenerator = await transformers.pipeline('text-generation', MODEL, {
        dtype: 'q4f16',
        progress_callback: (event: { status?: string; progress?: number }) => {
          if (event?.status === 'progress' && typeof event.progress === 'number') {
            onProgress?.(
              `Downloading chat model ${Math.round(event.progress)}%`,
              0.35 + 0.6 * Math.min(1, event.progress / 100),
            );
          }
        },
      });
      const manifest: ChatManifest = {
        file: MODEL,
        bytes: 0,
        available: true,
      };
      writeLocalChatManifest(manifest);
      onProgress?.('Chat model ready', 1);
      return manifest;
    } finally {
      downloadInFlight = undefined;
    }
  })();
  return downloadInFlight;
}

export function createChatModel(): ChatModel {
  let generator: any, initializing: Promise<void> | undefined;
  return {
    name: 'SmolLM2-135M-Instruct - Transformers.js',
    async initialize() {
      if (generator || sharedGenerator) {
        generator ||= sharedGenerator;
        return;
      }
      if (initializing) return initializing;
      initializing = (async () => {
        try {
          const manifest = readLocalChatManifest();
          if (!manifest?.available) {
            throw Error(
              'Chat model is not installed in this browser. Connect once and tap Download models, then offline use works.',
            );
          }
          transformers ||= await runtimeImport(CDN);
          preferBrowserCache(transformers);
          // Use browser cache from the download step — do not re-resolve a remote manifest.
          sharedGenerator = await transformers.pipeline('text-generation', manifest.file || MODEL, {
            dtype: 'q4f16',
          });
          generator = sharedGenerator;
        } catch (error) {
          initializing = undefined;
          throw error;
        }
      })();
      return initializing;
    },
    async generate(turns: TutorTurn[], onToken, options: GenerationOptions = {}) {
      await this.initialize();
      if (!generator) throw Error('Web chat model did not initialize');
      const effectiveTurns =
        options.jsonSchema != null
          ? [
              ...turns,
              {
                role: 'user' as const,
                content:
                  'Respond with valid JSON only that matches the required schema. No markdown fences, no prose outside JSON.',
              },
            ]
          : turns;
      const prompt =
        effectiveTurns
          .map((turn) => `<|im_start|>${turn.role}\n${turn.content}<|im_end|>`)
          .join('\n') + '\n<|im_start|>assistant\n';
      let raw = '';
      const temperature = options.temperature ?? (options.jsonSchema ? 0 : 0.25);
      const maxNewTokens = options.maxTokens ?? (options.jsonSchema ? 260 : 280);
      const genOptions: any = {
        max_new_tokens: maxNewTokens,
        temperature,
        do_sample: temperature > 0,
        repetition_penalty: 1.08,
        return_full_text: false,
      };
      if (onToken) {
        genOptions.streamer = new transformers.TextStreamer(generator.tokenizer, {
          skip_prompt: true,
          skip_special_tokens: true,
          callback_function: (text: string) => {
            raw += text;
            onToken(text);
          },
        });
      }
      const output: any = await generator(prompt, genOptions);
      const generated = output?.[0]?.generated_text;
      return (typeof generated === 'string' ? generated : raw).trim();
    },
  };
}

function preferBrowserCache(mod: any) {
  try {
    if (mod?.env) {
      mod.env.useBrowserCache = true;
      // Keep remote allowed only so first download can populate the cache; after that
      // the browser cache serves weights without re-fetching when online policy allows.
    }
  } catch {
    // ignore
  }
}

function readLocalChatManifest(): ChatManifest | null {
  try {
    const raw = globalThis.localStorage?.getItem(LOCAL_MANIFEST_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const m = parsed as Record<string, unknown>;
    if (typeof m.file !== 'string' || m.available !== true) return null;
    return {
      file: m.file,
      bytes: typeof m.bytes === 'number' ? m.bytes : 0,
      available: true,
    };
  } catch {
    return null;
  }
}

function writeLocalChatManifest(manifest: ChatManifest) {
  globalThis.localStorage?.setItem(LOCAL_MANIFEST_KEY, JSON.stringify(manifest));
}
