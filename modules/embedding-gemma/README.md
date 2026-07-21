# EmbeddingGemma native adapter

The JavaScript contract expects an Expo native module named `EmbeddingGemma` with:

- `load(modelPath: string, dimensions: number): Promise<void>`
- `embed(promptedText: string): Promise<number[]>`

For production Android/iOS builds, implement this boundary with Google's LiteRT runtime and a quantized EmbeddingGemma task/TFLite package. The app already supplies Google's recommended retrieval query/document prefixes and requests 128-dimensional Matryoshka embeddings.

This native module cannot run in Expo Go. Use `npx expo prebuild` and a development build after the LiteRT implementation and native dependencies are added. Until then, the app uses a deterministic normalized 128-dimensional fallback after downloading the mock artifact.
