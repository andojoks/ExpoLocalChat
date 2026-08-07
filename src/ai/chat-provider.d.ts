import type { ChatModel } from './chat-model';

export type ChatGpuBackend = 'opencl' | 'hexagon' | 'metal' | 'cpu';

export type ChatGpuStatus = {
  enabled: boolean;
  backend: ChatGpuBackend;
  reason?: string;
  devices?: unknown;
};

export type ChatManifest = { file: string; bytes: number; available: boolean };

export type ChatModelInstallStatus = {
  installed: boolean;
  label: string;
  bytes?: number;
};

export declare function createChatModel(): ChatModel;
export declare function getChatGpuStatus(): ChatGpuStatus | null;
export declare function getChatModelInstallState(): Promise<ChatModelInstallStatus>;
export declare function downloadChatModel(
  onProgress?: (label: string, progress: number) => void,
): Promise<ChatManifest>;
