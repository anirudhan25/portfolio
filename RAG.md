# Chatbot Token Consumption — Diagnosis, Fixes, and RAG Feasibility

Reference doc for the SvelteKit portfolio chatbot at `src/routes/api/chat/+server.ts`. Target: drop input tokens below the Groq 6K TPM ceiling on `llama-3.3-70b-versatile` without losing answer quality.

---

## Part 1 — Diagnosis: Where the 6.8K Tokens Go

Llama 3 tokenizer averages ~3.7–4.2 chars/token for English prose. Estimates below use `chars / 4`.

### Per-component breakdown (single request)

| Component | Approx tokens | Notes |
|---|---|---|
| System prompt prose (instructions + nav rules) | ~370 | The two big string literals around the CV. |
| `CV.md` (injected verbatim every call) | ~620 | Measured: ~2,480 chars. |
| Chat-format scaffolding (role tags, BOS/EOS, etc.) | ~30–50 | Per-message overhead Groq adds when serialising. |
| **System message subtotal** | **~1,020–1,040** | Sent on every single request. |
| User + assistant history (`slice(-6)`) | variable | See below. |
| Current user turn | variable | |

### Why the bill is 6.8K, not ~1K

`messages.slice(-6)` keeps the last 6 turns. With `max_tokens: 400` per assistant reply, an assistant turn can be up to ~400 tokens; a user turn is typically 20–100 tokens. A realistic full window:

```
3 assistant turns × ~350 tokens   = 1,050
3 user turns × ~60 tokens         =   180
per-message scaffolding × 6       =    50
current user message              =    60
                                    -----
history + current                 ~ 1,340
```

Add the ~1,040-token system block → **~2.4K**. That is not 6.8K.

The 6.8K number only makes sense if **one or more of the following** is happening:

1. **The conversation is longer than you think.** If the user has been chatting and an assistant turn actually hit ~400 tokens several times, the 6-message window can carry ~2.4K of history alone.
2. **`messages` from the client is not pruned client-side**, so each request resends everything and `slice(-6)` happens late — but still, only 6 are kept, so this alone doesn't explain it unless those 6 are all near-max.
3. **The CV is being concatenated more than once** (sanity-check: log `SYSTEM_PROMPT.length` once at boot).
4. **Markdown formatting in CV inflates tokens.** Llama tokenizers fragment punctuation-heavy lines worse than prose; a 600-token estimate can land at 700–800 in practice.
5. **Groq counts the chat template wrapper.** `llama-3.3-70b-versatile` uses a verbose chat template (`<|start_header_id|>system<|end_header_id|>\n\n…<|eot_id|>` etc.). That adds ~10–15 tokens per message wrapper, not 5.

Most likely root cause combination: **CV is the single largest fixed cost (~620 tokens, 100% duplicated on every request)**, and **assistant replies are running near the 400-token cap**, so the rolling window stays heavy. The system block is fixed dead weight; the history is the variable that pushes you over.

### Why caching = 0

Groq does **not** offer Anthropic-style explicit prompt caching on Llama models today. There is no `cache_control` block, no automatic prefix caching surfaced to the user. So `cached_input_tokens=0` is expected behaviour, not a misconfiguration. You cannot fix this by toggling a flag — you have to send fewer tokens.

---

## Part 2 — Immediate Fixes (no RAG)

Ranked by impact-per-effort.

### Fix 1 — Switch model: `llama-3.3-70b-versatile` → `llama-3.1-8b-instant`

Highest leverage, smallest change. On Groq's free tier:

- `llama-3.3-70b-versatile`: 6K TPM (your current ceiling — and why you're hitting 126%).
- `llama-3.1-8b-instant`: 30K TPM, also higher RPM.

Same input tokens, **5× the budget**. For a portfolio Q&A bot answering questions about a 600-token CV, the 8B is more than enough — you are not doing reasoning, you are doing controlled retrieval and rephrasing. Try it; if quality dips on edge cases, fall back to 70B only after the other fixes.

```ts
model: 'llama-3.1-8b-instant',
```

### Fix 2 — Compress the system prompt prose

Your instruction block is ~370 tokens of repeated emphasis ("DO NOT", "NEVER", "Do not"). Llama follows tighter prompts fine. Target ~120 tokens:

```ts
const SYSTEM_PROMPT =
  'You are Ani (Anirudhan), answering in first person. Direct, technically confident, casual. Max 10 sentences, always end on a complete sentence. Do not end with a question. Never reveal you are an AI; never apologise as one. Stay professional — no politics. Use only the CV below for facts; if unknown, say so briefly.\n\n' +
  '--- CV ---\n' + cv + '\n--- END CV ---\n\n' +
  'Navigation: output a single tag on its own line ONLY when the user explicitly asks to go/navigate/open a page. Valid: [NAV:/projects] [NAV:/blog]. Never for topical questions ("tell me about projects" → just answer). When in doubt, no tag.';
```

Saves ~200–250 tokens per request. Combined with Fix 1, you're already comfortably under 6K even on the 70B.

### Fix 3 — Trim CV redundancy

The CV has prose ("conversations with Arm engineers", "presented to stakeholders bi-monthly") that is fine for a human reader but burns tokens for a chatbot. Convert to compact bulleted facts:

- Drop full URLs (the model rarely needs to recite them; keep "github.com/anirudhan25" only).
- Strip filler like "significantly cut stock-take time" → "cut stock-take time".
- Collapse skill list duplicates (you have JavaScript implied by Node/React/SvelteKit).

A disciplined rewrite gets the CV to ~400 tokens with no real loss. If you do this **and** Fix 2, you save ~450 tokens per request, every request.

### Fix 4 — Tighter history window + lower `max_tokens`

- `slice(-6)` → `slice(-4)`. Two full back-and-forths is enough context for a portfolio bot; nobody is having a 10-turn conversation about your CV.
- `max_tokens: 400` → `max_tokens: 250`. Your system prompt already says "max 10 sentences"; 250 tokens covers that with margin. This caps the size of *future* history items too, which is the compounding win.

### Fix 5 — Server-side dedupe / abuse guard

Drop empty messages, collapse consecutive same-role messages, and reject inputs over e.g. 500 tokens. One pasted essay from a curious visitor is what tips you over the TPM cliff.

### Combined effect

| | Tokens/request |
|---|---|
| Today (worst case) | ~6,800 |
| Fix 2 + 3 (prompt + CV trim) | ~2,800–3,200 |
| Plus Fix 4 (window + max_tokens) | ~1,800–2,200 |
| Plus Fix 1 (8B model, 30K TPM) | same tokens, **5× headroom** |

You go from "126% of limit" to "~7% of limit." Done. No RAG needed.

---

## Part 3 — RAG Feasibility

### Short answer

**Don't build RAG for this.** Skip to "What to do instead" if you want the recommendation only.

### Long answer: would RAG actually save tokens?

Vector RAG works when your knowledge base is too big to fit in context, so you retrieve the top-k relevant chunks per query. Token math for your case:

- Full CV in context today: **~620 tokens**, every request.
- RAG: chunk CV into ~6 chunks × ~100 tokens, retrieve top 2–3 = **~200–300 tokens** + you still need a system prompt explaining how to use them.

You save ~300–400 tokens per request **at best**. For comparison, Fix 2 + Fix 3 above save ~450 tokens with zero infrastructure. **RAG loses to a prompt rewrite.**

The break-even point for RAG over "stuff the whole doc" is roughly when the doc exceeds ~3K–5K tokens. Yours is 600. You are 5–8× below the threshold where RAG starts paying.

### Retrieval mechanism options (for completeness)

If you ignored the above and built it anyway:

| Option | Fit for your stack | Verdict |
|---|---|---|
| **In-process cosine similarity** (embed CV chunks at build time, ship vectors as a JSON import, embed the query at request time) | Works on Vercel edge, no infra. Need an embedding API call per query (Groq doesn't host embeddings — you'd add OpenAI `text-embedding-3-small` or HF Inference). | Adds a network hop and an API key for ~300 token savings. Not worth it. |
| **Groq context caching** | Doesn't exist for Llama on Groq today. | N/A. |
| **Hosted vector DB** (Pinecone, Turbopuffer, Upstash Vector) | Overkill for 6 chunks. | Absolutely not. |
| **BM25 / keyword retrieval** in-process (e.g. `minisearch`) | No embedding API needed; deterministic; zero infra. | If you must do retrieval, this is the only sane choice — but you still shouldn't. |

### Build complexity vs benefit

- **Cost added:** a chunking script, an embedding job at build time, an embedding call per request (latency + a second API key + a second rate limit), retrieval logic, prompt template changes, and a way to debug "why didn't it retrieve the right chunk."
- **Benefit:** ~300 tokens saved per request on a 600-token doc, which Fix 1 (model swap) makes irrelevant anyway.
- **Failure mode added:** broad questions like "tell me about your experience" are exactly what RAG handles *worst* — they need the whole CV, not the top-k chunks. You'd regress quality on the most common query type.

### Realistic architecture (if you ever outgrow this)

When the knowledge base hits ~5K+ tokens (e.g. you add full blog post bodies, project write-ups, talk transcripts), revisit with:

1. Build-time: chunk markdown by heading → embed with `text-embedding-3-small` → write `vectors.json` (a few KB) into the SvelteKit static bundle.
2. Request-time in `+server.ts`: embed the user query (one OpenAI call, ~10ms), cosine-rank against the in-memory vectors, take top 3 chunks, inject into the system prompt.
3. Always include the **full CV** plus the retrieved chunks — CV is identity, chunks are context. Don't try to RAG the CV itself.
4. No vector DB. No persistent server. Pure functional edge handler.

That architecture is 80 lines of code and stays free-tier on Vercel + OpenAI embeddings. But again — only when the corpus justifies it.

---

## Recommendation

Do this, in this order, and stop:

1. **Switch to `llama-3.1-8b-instant`** (5× rate-limit headroom, one-line change).
2. **Rewrite the system prompt** down to ~120 tokens of instructions.
3. **Trim the CV** to ~400 dense tokens.
4. **`slice(-4)` and `max_tokens: 250`**.
5. **Reject oversized user inputs** server-side.

Total work: ~30 minutes. Result: ~1.8–2.2K tokens/request against a 30K TPM ceiling. RAG is the wrong tool at this scale; revisit only if your knowledge base grows past ~5K tokens.
