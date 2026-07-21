# Mobile runtime

The native chat model uses `Qwen2.5-0.5B-Instruct GGUF Q4_0` through `llama.rn` (Q4_0 is required for Android OpenCL GPU offload).

Runtime flow:

1. The app downloads the GGUF from the development model server into app document storage.
2. `llama.rn` loads the downloaded GGUF locally (OpenCL first, then one Hexagon HTP0 retry on Android, else CPU).
3. The agent runs a ReAct tool loop against local SQLite / embeddings.
4. Qwen writes the final streamed tutor response from tool evidence.

Set `EXPO_PUBLIC_CHAT_MODEL_URL` only if you want to override the default. The default is:

`http://127.0.0.1:8787/models/qwen2.5-0.5b-instruct/qwen2.5-0.5b-instruct-q4_0.gguf`

For a physical device, replace `127.0.0.1` with the development computer's LAN IP in the in-app server URL field.

Place the model at:

`../model-server/models/qwen2.5-0.5b-instruct/qwen2.5-0.5b-instruct-q4_0.gguf`

Source:

`https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_0.gguf`

Native inference requires an EAS development or production build. Expo Go cannot load `llama.rn`.

## GPU checklist

1. Rebuild Android after OpenCL plugin changes: `npm run development-build:android`
2. Install the new APK; let the app re-download Q4_0 (legacy Q4_K_M is deleted automatically)
3. Confirm debug status shows `GPU on · OpenCL` or `NPU on · Hexagon`
4. If still CPU: chipset must be Adreno 700+ or Snapdragon 8 Gen 1+
