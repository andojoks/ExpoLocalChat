# Mobile runtime

The native chat model now uses `Qwen2.5-0.5B-Instruct GGUF Q4_K_M` through `llama.rn`.

Runtime flow:

1. The app downloads the GGUF from the development model server into app document storage.
2. `llama.rn` loads the downloaded GGUF locally.
3. The agent first asks Qwen for a constrained JSON tool plan.
4. Local SQLite and EmbeddingGemma tools retrieve grounded question-bank records.
5. Qwen writes the final streamed tutor response from the tool output.

Set `EXPO_PUBLIC_CHAT_MODEL_URL` only if you want to override the default. The default is:

`http://127.0.0.1:8787/models/qwen2.5-0.5b-instruct/qwen2.5-0.5b-instruct-q4_k_m.gguf`

For a physical device, replace `127.0.0.1` with the development computer's LAN IP in the in-app server URL field.

Place the model at:

`../model-server/models/qwen2.5-0.5b-instruct/qwen2.5-0.5b-instruct-q4_k_m.gguf`

Source:

`https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf`

Native inference requires an EAS development or production build. Expo Go cannot load `llama.rn`.
