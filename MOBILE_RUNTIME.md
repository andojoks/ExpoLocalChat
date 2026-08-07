# Mobile runtime

The native chat model uses `SmolLM2-135M GGUF Q4_0` through `llama.rn`.

Runtime flow:

1. The app downloads the GGUF from `apiBaseUrl` (`extra.apiBaseUrl` in `app.json`) into app document storage.
2. `llama.rn` loads the downloaded GGUF locally (OpenCL first, then one Hexagon HTP0 retry on Android, else CPU).
3. The Tutor Runtime runs deterministic intent/slots/tools against local SQLite / embeddings.
4. SmolLM2 streams the final tutor reply from prepared evidence only.

Set `EXPO_PUBLIC_CHAT_MODEL_URL` only if you want to override the default. The default is:

`{apiBaseUrl}/models/smollm2-function/SmolLM2-135M.Q4_0.gguf`

For a physical device, set `extra.apiBaseUrl` in `app.json` (or `EXPO_PUBLIC_API_BASE_URL`) to the development computer's LAN IP, for example `http://192.168.1.20:3000`.

Native inference requires an EAS development or production build. Expo Go cannot load `llama.rn`.

## GPU checklist

1. Rebuild Android after OpenCL plugin changes: `npm run development-build:android`
2. Install the new APK; let the app re-download SmolLM2 (legacy Qwen files are deleted automatically)
3. Confirm debug status shows `GPU on · OpenCL` or `NPU on · Hexagon`
4. If still CPU: chipset must be Adreno 700+ or Snapdragon 8 Gen 1+
