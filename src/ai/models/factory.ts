import type { ChatModel } from '../chat-model';
import { createChatModel as createPlatformChatModel } from '../chat-provider';
import { createHttpChatModel } from './http-chat-model';

export type ChatBackendKind = 'local' | 'http';

/** Platform ChatModel (llama.rn / Transformers) or remote OpenAI-compat HTTP. */
export function createChatModelFromEnv(): ChatModel {
  const backend = (process.env.EXPO_PUBLIC_CHAT_BACKEND || 'local').toLowerCase() as ChatBackendKind;
  if (backend === 'http') {
    const baseUrl = process.env.EXPO_PUBLIC_CHAT_API_URL;
    const model = process.env.EXPO_PUBLIC_CHAT_MODEL || 'gpt-4o-mini';
    if (!baseUrl)
      throw Error('EXPO_PUBLIC_CHAT_API_URL is required when EXPO_PUBLIC_CHAT_BACKEND=http');
    return createHttpChatModel({
      baseUrl,
      apiKey: process.env.EXPO_PUBLIC_CHAT_API_KEY,
      model,
    });
  }
  return createPlatformChatModel();
}
