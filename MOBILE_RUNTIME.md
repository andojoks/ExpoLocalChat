# Mobile model runtime

The production mobile pipeline is:

1. `QuantFactory SmolLM2-135M` runs through `llama.rn` from a runtime-downloaded Q4_0 GGUF file.
2. Its first constrained generation chooses one of the narrow database tools using JSON Schema.
3. `search_exam_questions` invokes EmbeddingGemma and ranks SQLite question records.
4. Exact/paginated tools query SQLite without embeddings when filters are sufficient.
5. Tool output is returned to SmolLM2 for a grounded, streamed tutor response.

Set `EXPO_PUBLIC_CHAT_MODEL_URL` to the static GGUF URL. The default is:

`http://127.0.0.1:8787/models/smollm2-function/SmolLM2-135M.Q4_0.gguf`

For a physical device, replace `127.0.0.1` with the development computer's LAN IP. Place the model at `../model-server/models/smollm2-function/SmolLM2-135M.Q4_0.gguf`.

This native module does not run in Expo Go. Build an EAS development client after the GGUF artifact is available.
