# QuestionBankChat

Expo SDK 57 mobile-first proof of concept for a private Cameroon GCE past-question tutor.

## Architecture

- Expo, React Native, Expo Router, and NativeWind chat UI.
- Expo SQLite for exam hierarchy, embeddings, sync state, conversations, messages, knowledge graph, and agent checkpoints.
- Deterministic **Tutor Runtime** (intent gate + slots + Zod tools); the small LLM only streams tutor prose from prepared evidence.
- Pluggable chat backends behind `ChatModel`: on-device `llama.rn` (native), Transformers.js (web), or OpenAI-compatible HTTP (`EXPO_PUBLIC_CHAT_BACKEND=http`).
- EmbeddingGemma boundary: LiteRT native adapter on Android/iOS, Transformers.js on web, and a deterministic mock fallback.
- ExpertLearner API (`extra.apiBaseUrl` in `app.json`) serves auth, packs, and on-device model downloads.

## Run

From `QuestionBankChat`:

```bash
# ensure ExpertLearner API is running (apiBaseUrl in app.json)
npx expo start --clear
```

For a physical phone, set `extra.apiBaseUrl` in `app.json` (or `EXPO_PUBLIC_API_BASE_URL`) to your computer's LAN address, for example `http://192.168.1.20:3000`.

Optional remote chat:

```bash
EXPO_PUBLIC_CHAT_BACKEND=http
EXPO_PUBLIC_CHAT_API_URL=https://api.openai.com/v1
EXPO_PUBLIC_CHAT_API_KEY=...
EXPO_PUBLIC_CHAT_MODEL=gpt-4o-mini
```

## Production model

Native chat uses **SmolLM2-135M GGUF Q4_0** via `llama.rn`. Embedding and chat model artifacts are downloaded from `apiBaseUrl` (`/models/...`). Expo Go cannot load `llama.rn` or custom LiteRT modules — use an EAS development build.
