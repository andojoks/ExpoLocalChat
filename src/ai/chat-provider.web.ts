import type { ChatModel, GenerationOptions, TutorTurn } from './chat-model';

const MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';
const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1';
const runtimeImport = (url: string) =>
  (new Function('url', 'return import(url)') as (url: string) => Promise<any>)(url);
let transformers: any;

export function getChatGpuStatus() {
  return null;
}

export function createChatModel(): ChatModel {
  let generator: any, initializing: Promise<void> | undefined;
  return {
    name: 'Qwen2.5-0.5B-Instruct - Transformers.js',
    async initialize() {
      if (generator) return;
      if (initializing) return initializing;
      initializing = (async () => {
        transformers ||= await runtimeImport(CDN);
        generator = await transformers.pipeline('text-generation', MODEL, { dtype: 'q4f16' });
      })();
      return initializing;
    },
    async generate(turns: TutorTurn[], onToken, options: GenerationOptions = {}) {
      await this.initialize();
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
        transformers ||= await runtimeImport(CDN);
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
