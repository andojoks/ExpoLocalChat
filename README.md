# QuestionBankChat

Expo SDK 57 mobile-first proof of concept for a private Cameroon GCE past-question tutor.

## Architecture

- Expo, React Native, Expo Router, and NativeWind chat UI.
- Expo SQLite for exam hierarchy, embeddings, sync state, conversations, and messages.
- LangChain Core tools and runnable orchestration for catalogue inspection, semantic retrieval, and question details.
- EmbeddingGemma boundary: LiteRT native adapter on Android/iOS, Transformers.js on web, and a deterministic 128d mock fallback.
- A separate sibling service at `../model-server` owns model manifests and downloadable artifacts. Model binaries never sit inside the Expo source tree.

EmbeddingGemma performs retrieval, not language generation. This mock returns authored Markdown answers and full explanations from retrieved records. A future on-device generative Gemma model can replace the response composer without changing the tools or database.

## Run

From `QuestionBankChat`:

```bash
npm run model-server
npx expo start --clear
```

Run those commands in separate terminals. For a physical phone, set `EXPO_PUBLIC_MODEL_SERVER_URL` to the computer's LAN address, for example `http://192.168.1.20:8787`.

## Production model

The repository does not redistribute gated Gemma weights. Put your licensed quantized LiteRT `.task` or `.tflite` artifact in `../model-server/models/`, then start the server with `EMBEDDING_MODEL_FILE` set to its filename. Implement the native adapter described in `modules/embedding-gemma/README.md` and build with EAS/Expo cloud. Expo Go cannot load custom LiteRT native code.

Google's EmbeddingGemma retrieval prompt formats are applied automatically:

- Query: `task: question answering | query: ...`
- Document: `title: ... | text: ...`
