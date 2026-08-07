# QuestionBank AI (`src/ai`)

On-device Cameroon GCE tutor stack: a **deterministic control plane** (intent, slots, tools, checkpoints, knowledge graph) plus a **small local LLM** that only writes streamed tutor prose from prepared evidence.

There is **no LangChain**. Tool choice is never delegated to the model.

---

## Mental model

| Plane | Owns | Does **not** own |
|--------|------|------------------|
| **Control** (`runtime/`, `tools.ts`, SQLite) | Intent, exam slots, which tool to run, args, checkpoints, graph/vector memory | Natural-language wording |
| **Presentation** (`ChatModel`) | Chitchat, clarifying questions, final answer / explanation (streamed) | Tool planning, DB queries |

```text
Student message
      │
      ▼
┌─────────────────────┐
│  QuestionBankAgent  │  UI facade → TutorRuntime
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│    TutorRuntime     │  startTurn / resumeTurn
└──────────┬──────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
 IntentGate    SlotFiller     (deterministic)
     │            │
     └─────┬──────┘
           ▼
   ToolRegistry (Zod) ──► SQLite exam bank
           │                 + embeddings
           │                 + kg graph
           ▼
   Context pack (evidence + memory + graph)
           ▼
   ChatModel.generate ──► streamed markdown
```

---

## Folder map

```text
src/ai/
├── agent.ts                 # UI-facing QuestionBankAgent facade
├── chat-model.ts            # ChatModel / TutorTurn contract
├── chat-provider.native.ts  # llama.rn + SmolLM2 GGUF
├── chat-provider.web.ts     # Transformers.js (web fallback)
├── chat-provider.d.ts       # Shared type exports for GPU status
├── chitchat.ts              # Fast greeting / meta-chat detector
├── prompts.ts               # Presentation system prompts + helpers
├── tools.ts                 # Zod ToolRegistry over SQLite
├── tool-names.ts            # Canonical tool name list
├── models/
│   ├── factory.ts           # local | http ChatModel selection
│   └── http-chat-model.ts   # OpenAI-compatible remote backend
├── runtime/
│   ├── tutor-runtime.ts     # Checkpointed turn pipeline
│   ├── intent-gate.ts       # Keyword + embedding intent
│   ├── slots.ts             # OL/AL / year / subject extraction
│   ├── tool-runner.ts       # Validate + execute one tool
│   ├── context-pack.ts      # Build LLM turns from evidence
│   └── graph-extract.ts     # Entities/edges into kg_* tables
├── memory/
│   ├── conversation-rag.ts  # Embed / retrieve chat turns
│   └── summarize.ts         # Optional overflow summary
└── embeddings/
    ├── embedding.ts         # EmbeddingProvider + Hash fallback
    ├── platform-provider.*  # LiteRT EmbeddingGemma (native) / hash (web)
    └── model-manager.*      # Download / install embedding weights
```

Related persistence lives in [`../db/database.ts`](../db/database.ts) (`agent_runs`, `agent_steps`, `kg_nodes`, `kg_edges`, `message_embeddings`, questions).

---

## End-to-end turn flow

### 1. UI entry

[`QuestionBankAgent.invoke`](agent.ts) accepts the chat screen’s shape (`message`, `context`, `history`, message ids) and maps runtime phases to UI labels:

| Runtime phase | UI `AgentPhase` |
|---------------|-----------------|
| `route` | `plan` |
| `tool` | `tool` |
| `await_user` / `answer` | `answer` |

Streaming uses `onToken` only on LLM presentation steps.

### 2. Start or resume

[`TutorRuntime.startTurn`](runtime/tutor-runtime.ts):

1. If an open run for this conversation is `awaiting_user` or `failed` → **`resumeTurn`** (checkpoint resume).
2. Else create `agent_runs` row (`running`) and execute the pipeline.

### 3. Route (no LLM)

[`resolveIntent`](runtime/intent-gate.ts):

1. Chitchat regex ([`chitchat.ts`](chitchat.ts)).
2. Keyword rules: catalogue / list / explain / search.
3. Embedding cosine against intent prototypes when ambiguous (EmbeddingGemma or hash).

[`fillSlots`](runtime/slots.ts) merges message + prior run slots + `AgentContext` (OL/AL, year, paper, subject phrases, active question id).

[`slotsNeedClarify`](runtime/intent-gate.ts) may pause with `awaiting_user` and stream one clarifying question via the LLM.

### 4. Tools (deterministic)

[`planTools`](runtime/tutor-runtime.ts) picks tools from intent + slots. Args come from slots — **never from model JSON**.

| Tool | Role |
|------|------|
| `list_exam_categories` | GCE OL / AL categories |
| `list_subjects` | Subjects under a category |
| `list_papers` | Papers by subject / year / number |
| `list_sections` | Optional sections for a paper |
| `list_exam_questions` | Exact filtered list + pagination |
| `get_question_details` | Full markdown question tree (explain path) |
| `search_exam_bank` | Embedding search across hierarchy levels |
| `search_conversation_memory` | Chat-turn vectors + graph neighborhood |

[`runTool`](runtime/tool-runner.ts) validates with Zod and returns a `ToolTrace` for the debug UI.

Completed tool steps are stored in `agent_steps` so resume can skip already-done work.

### 5. Memory + knowledge graph

After user/assistant turns and tool hits:

- **Vectors:** [`indexChatMessage`](memory/conversation-rag.ts) → `message_embeddings`.
- **Graph:** [`extractAndLinkTurn`](runtime/graph-extract.ts) → `kg_nodes` / `kg_edges`  
  (`Message`, `Entity` for Subject/Year/Topic/Category/Paper/Question; rels `ASKS_ABOUT`, `MENTIONS`, `REFERS_TO_QUESTION`, …).

Answer packing merges:

1. Tool evidence JSON  
2. Conversation memory hits  
3. Graph neighbors for the active question  

into a fixed prompt ([`context-pack.ts`](runtime/context-pack.ts)).

### 6. Presentation (LLM only)

[`ChatModel.generate`](chat-model.ts) with turns from:

- `CHITCHAT_SYSTEM` / `CLARIFY_SYSTEM` / `ANSWER_SYSTEM` / `EXPLAIN_SYSTEM` ([`prompts.ts`](prompts.ts))

Tokens stream to the UI. Then the run is marked `completed` (or left `awaiting_user` / `failed`).

---

## Checkpointing & follow-ups

Tables: `agent_runs`, `agent_steps`.

| Status | Meaning |
|--------|---------|
| `running` | Mid-pipeline |
| `awaiting_user` | Missing slot; clarifying question was streamed |
| `ready_to_answer` | Tools done; about to generate |
| `completed` | Final reply stored |
| `failed` | Error saved; next message can resume |

Resume merges the new user reply into slots and continues from the last successful step (LangGraph-like interrupt without LangGraph).

---

## Chat models

### Contract

```ts
interface ChatModel {
  name: string;
  initialize(): Promise<void>;
  generate(turns, onToken?, options?): Promise<string>;
}
```

Factory: [`createChatModelFromEnv()`](models/factory.ts)

| `EXPO_PUBLIC_CHAT_BACKEND` | Implementation |
|----------------------------|----------------|
| `local` (default) | Platform provider |
| `http` | [`http-chat-model.ts`](models/http-chat-model.ts) OpenAI-compatible API |

### Native (`chat-provider.native.ts`)

- **Weights:** `SmolLM2-135M.Q4_0.gguf` (~91.7 MB) via `apiBaseUrl`  
  `GET {apiBaseUrl}/models/smollm2-function/...`
- **Runtime:** `llama.rn` (`initLlama` + `completion`)
- **GPU path:** `n_gpu_layers: 99` → OpenCL (Adreno 700+) → one Hexagon `HTP0` retry → CPU
- **Context:** `n_ctx: 2048`, batch 256
- Streaming: completion callback → `onToken`

### Web (`chat-provider.web.ts`)

- Transformers.js pipeline with `HuggingFaceTB/SmolLM2-135M-Instruct` (GGUF is native-only).

---

## Embeddings

[`EmbeddingProvider`](embeddings/embedding.ts): `embedQuery` / `embedDocuments`, 128-d default, cosine helper.

| Platform | Provider |
|----------|----------|
| Native | EmbeddingGemma via LiteRT if module present; else `HashEmbeddingProvider` |
| Web | Hash (POC) |

Used for:

- Exam bank RAG (`search_exam_bank` across categories/subjects/papers/sections/questions)
- Intent prototype matching
- Chat-turn and entity embeddings
- Conversation memory retrieve

Weights are downloaded through [`model-manager`](embeddings/model-manager.ts) from `apiBaseUrl` (`extra.apiBaseUrl` in `app.json`).

---

## Why this shape (for a tiny on-device LLM)

1. **SmolLM2-135M is a writer, not a planner** — JSON tool loops were slow and unreliable.
2. **Zero LLM hops for browse/list/catalogue** — only one streamed reply after SQLite tools.
3. **Checkpoints** enable clarify → answer and crash recovery without redoing tools.
4. **Dual memory** (vectors + graph) grounds “that question” / “last biology paper” without stuffing full history into `n_ctx`.

---

## Typical paths

**Catalogue:** `"what subjects are available?"`  
→ intent `catalogue` → `list_exam_categories` → streamed answer from evidence.

**List:** `"Show 2024 Biology paper 2"`  
→ slots filled → `list_exam_questions` → streamed list summary.

**Vague list:** `"list questions"`  
→ `awaiting_user` (“Which subject?”) → resume with `"Biology 2024"` → list + answer.

**Explain:** `"explain that"` with `activeQuestionId`  
→ `get_question_details` → `EXPLAIN_SYSTEM` streamed walkthrough.

**Chitchat:** `"hello"`  
→ no tools → short streamed greeting.

---

## Debug surface

When `AGENT_DEBUG` is on, assistant messages carry:

- `toolCalls` — name, args, preview, result counts  
- `agentDebug` — `route` / `slot` / `tool` / `clarify` / `answer` / `error` steps  

GPU status: `getChatGpuStatus()` from the native chat provider.

---

## Configuration cheat sheet

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_CHAT_BACKEND` | `local` \| `http` |
| `EXPO_PUBLIC_CHAT_API_URL` | HTTP base URL |
| `EXPO_PUBLIC_CHAT_API_KEY` | Optional HTTP key |
| `EXPO_PUBLIC_CHAT_MODEL` | Remote model id |
| `EXPO_PUBLIC_CHAT_MODEL_URL` | Override GGUF download URL |
| `EXPO_PUBLIC_API_BASE_URL` / `extra.apiBaseUrl` | Host for API + model downloads |

Default GGUF URL:

`{apiBaseUrl}/models/smollm2-function/SmolLM2-135M.Q4_0.gguf`

---

## Extension points

- **New intent:** keyword branch in `intent-gate.ts` + `planTools` mapping in `tutor-runtime.ts`.
- **New tool:** Zod schema + `execute` in `tools.ts`, register name in `tool-names.ts`, wire in `planTools`.
- **Richer graph:** extend extractors in `graph-extract.ts` (still deterministic preferred).
- **Stronger LLM:** swap GGUF / HTTP backend; keep the control plane unchanged.
