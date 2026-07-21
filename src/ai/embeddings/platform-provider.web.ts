import {HashEmbeddingProvider,type EmbeddingProvider} from './embedding';

// Expo web/Expo Go use the deterministic local fallback for the POC. The full
// ONNX ZIP is still served for a worker-backed web runtime or EAS dev build.
export function createPlatformProvider():EmbeddingProvider{return new HashEmbeddingProvider()}
