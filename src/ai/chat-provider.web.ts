import type { ChatModel, TutorTurn } from './chat-model';
import { cleanGeneratedText, cleanTokenDelta } from './output-sanitizer';
const MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';
const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1';
const runtimeImport = (url: string) =>
  (new Function('url', 'return import(url)') as (url: string) => Promise<any>)(url);
let transformers: any;
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
    async generate(turns: TutorTurn[], onToken) {
      await this.initialize();
      const prompt =
        turns.map((turn) => `<|im_start|>${turn.role}\n${turn.content}<|im_end|>`).join('\n') +
        '\n<|im_start|>assistant\n';
      let raw = '',
        clean = '';
      const options: any = {
        max_new_tokens: 280,
        temperature: 0.25,
        do_sample: true,
        repetition_penalty: 1.08,
        return_full_text: false,
      };
      if (onToken) {
        transformers ||= await runtimeImport(CDN);
        options.streamer = new transformers.TextStreamer(generator.tokenizer, {
          skip_prompt: true,
          skip_special_tokens: true,
          callback_function: (text: string) => {
            raw += text;
            const next = cleanTokenDelta(raw, clean, turns);
            clean = next.clean;
            if (next.delta) onToken(next.delta);
          },
        });
      }
      const output: any = await generator(prompt, options),
        generated = output?.[0]?.generated_text;
      return cleanGeneratedText(typeof generated === 'string' ? generated : raw, turns);
    },
  };
}
