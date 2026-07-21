import type { ChatModel } from './chat-model';

export type ChatGpuBackend = 'opencl' | 'hexagon' | 'metal' | 'cpu';

export type ChatGpuStatus = {
  enabled: boolean;
  backend: ChatGpuBackend;
  reason?: string;
  devices?: unknown;
};

export declare function createChatModel(): ChatModel;
export declare function getChatGpuStatus(): ChatGpuStatus | null;
