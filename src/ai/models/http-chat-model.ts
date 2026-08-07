import type { ChatModel, GenerationOptions, TutorTurn } from '../chat-model';

export type HttpChatModelConfig = {
  baseUrl: string;
  apiKey?: string;
  model: string;
  name?: string;
};

/**
 * OpenAI-compatible Chat Completions backend (swappable for Google later via another ChatModel).
 */
export function createHttpChatModel(config: HttpChatModelConfig): ChatModel {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  return {
    name: config.name || `HTTP ${config.model}`,
    async initialize() {},
    async generate(turns: TutorTurn[], onToken, options: GenerationOptions = {}) {
      const body: Record<string, unknown> = {
        model: config.model,
        messages: turns.map((turn) => ({ role: turn.role, content: turn.content })),
        temperature: options.temperature ?? 0.25,
        max_tokens: options.maxTokens ?? 384,
        stream: Boolean(onToken),
      };
      if (options.jsonSchema) {
        body.response_format = {
          type: 'json_schema',
          json_schema: { name: 'response', strict: true, schema: options.jsonSchema },
        };
      }
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw Error(`Chat HTTP ${response.status}: ${detail.slice(0, 200)}`);
      }

      if (onToken && response.body) {
        return readSseContent(response, onToken);
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return (json.choices?.[0]?.message?.content || '').trim();
    },
  };
}

async function readSseContent(
  response: Response,
  onToken: (token: string) => void,
): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const token = parsed.choices?.[0]?.delta?.content;
        if (token) {
          raw += token;
          onToken(token);
        }
      } catch {
        // ignore malformed SSE chunks
      }
    }
  }
  return raw.trim();
}
