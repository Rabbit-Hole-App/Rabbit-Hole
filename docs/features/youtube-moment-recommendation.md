# Recommending YouTube moments

The tutor answers a question and puts the exact moment of the exact video in
front of the learner: a card opens at 4:12 → 5:38, already playing the passage
that answers. This is the long-term design; the card, the embed, the window
bar and Exa discovery already shipped as
[youtube-moments.md](youtube-moments.md) (phase 1).

The design descends from the `moment/` prototype in this repo — discover →
transcribe → retrieve → answer — with one discovery that reshaped it: the
prototype's "impossible in a worker" stack is not impossible. `@cf/baai/bge-m3`
(the 2.5 GB embedding model it downloads), `@cf/baai/bge-reranker-base`, and
Whisper all run on **Workers AI** as API calls, and **Vectorize** is a GA
vector database with a worker binding. Every stage maps onto a Cloudflare
primitive we already deploy on.

## The one decision everything else follows from

**Choosing the video and choosing the window is a single decision, made over
transcripts.** Exa's ranking is page-level: title, description, popularity.
Which of two "backprop explained" videos actually shows the weight update is
only in the captions. A video is recommended *because it contains the best
passage* — so the passage is found first, and it carries its video with it.
This is why the prototype's reranker scores windows, never videos, and this
spec keeps that shape at every temperature.

Windows have no fixed length. The model returns whatever tightly answers —
20 seconds for a definition, 4 minutes for a derivation — bounded to
5 s ≤ length ≤ 5 min, inside the video, or refused.

## The storage rule: embeddings, never text

Caption text is YouTube's content and storing it durably is a ToS grey zone.
Embeddings are one-way — the text cannot be reconstructed — so what this
system persists is derived numbers and coordinates, nothing quotable. That is
**risk minimisation, not zero exposure**: derived representations do not by
themselves settle contractual or copyright questions, they just remove the
worst version of them (a durable store of YouTube's text).

| stored durably | contains | exposure |
| --- | --- | --- |
| Vectorize | vectors + `{videoId, start, end}` metadata | minimised — numbers and timestamps |
| R2 | a caption-probe record per video (see negative cache below) | minimal — our own observation |
| D1 | chosen moments: question, videoId, window, confidence, accepted | our own log |

Caption text exists **only in flight**: fetched, embedded, shown to the model,
gone. The standard 1-hour Cache API layer applies to the caption fetch itself —
ordinary HTTP caching, the same as arXiv responses get.

The price, accepted knowingly: the answer-time verify step needs words, so a
warm answer refetches the winning video's captions — one YouTube fetch per
question instead of zero, absorbed by the Cache API for repeat topics within
the hour. The bge-reranker also needs text, so warm ranking is vector score →
top 2–3 videos → refetch those captions → model verifies. The reranker drops
out; at ≤3 candidates that loss is small — reranking earned its keep at 40.

## Three temperatures

```
HOT   the question was answered before   D1 log            ~instant
WARM  the topic is indexed               Vectorize + LLM   ~2–3 s
COLD  never seen                         Exa + captions    ~10–20 s
```

### Cold — and every cold question warms the corpus

1. `search_videos(question)` — Exa restricted to youtube.com (shipped).
2. Fetch timed captions for up to 5 candidates, best-effort. A candidate
   without captions stays in the running on title alone.
3. **Retrieve before reasoning.** Five transcripts can be five hour-long
   lectures — tens of thousands of words a model would have to search as a
   haystack. Instead: cut every transcript into 60 s windows (30 s stride),
   score windows against the question, keep the **top ~10–20 across all
   videos** with a per-video cap. In phase 2 the scorer is lexical — the
   prototype's BM25 leg, stdlib, no bindings. Phase 3 swaps that one function
   for bge-m3 similarity; nothing around it moves.
4. One model call sees those passages together — each with timestamps, video
   title and a few lines of surrounding context — and picks **the video and
   its window jointly**, plus a confidence and a one-line reason: the
   prototype's `answer.py` contract, over a pre-filtered field. The
   single-decision principle survives; only the haystack shrinks.
5. `show_video(videoId, start, end)` travels back over SSE and lands on the
   existing card (`insertVideo` already takes a moment). The chosen moment is
   written to the D1 log from day one — phase 4 only starts *reading* it.
6. **Indexing goes to a Queue, not `ctx.waitUntil`.** Five hour-long videos
   are ~600 windows to embed and upsert; `waitUntil` grants ~30 seconds after
   the response, and losing the work silently is exactly the failure a
   flywheel cannot see. The cold answer enqueues `{videosToIndex}` and
   returns; a Queue consumer (retries, up to 15-minute invocations) fetches,
   cuts, batch-embeds with `@cf/baai/bge-m3`, and upserts to Vectorize. The
   text is then discarded.

The gate on `show_video` is the same bargain `show_paper` and `show_wikipedia`
strike, keyed on **passages the model was actually shown** — not on captions
merely existing, because captions can parse and still yield zero relevant
passages, and a window for such a video would be cited from nothing. A video
without passages — unreadable captions, or nothing retrieved from them — may
be recommended window-less, marked "contents unverified" on the card. The
learner's own `video_context` card counts as found but never as read, so the
tutor can re-show it, only without inventing a window into it.

### Warm

1. Embed the question (one bge-m3 call).
2. Vectorize query, topK ≈ 20, max 2–3 windows per video — the prototype's
   per-video cap, so one long lecture cannot crowd out the field.
3. **Recall check**: if the best score is below the corpus threshold, fall
   through to cold — the index does not cover this topic yet, and a mediocre
   indexed answer must never beat a fresh search. This threshold is the one
   knob that keeps the flywheel from making answers worse.
4. Refetch captions for the top 2–3 videos, but hand the model **excerpts,
   not transcripts**: each candidate window plus ±30–60 s of surrounding
   lines. That is enough to tighten retrieved 4:00–5:00 into final 4:12–5:38
   without rereading a 90-minute lecture.

### Hot

Not a D1 lookup — semantic search cannot come from D1. The actual path:

```
question → bge-m3 → Vectorize (question vectors, workspace-scoped)
         → momentId → D1 moment record → confirm fit
```

So "hot" costs one embedding call, one vector query and usually one short
model confirmation: **fast, not instant** — seconds, not the milliseconds a
cache-hit table read would suggest. The log also becomes, for free, a growing
gold set for `moment/eval/run_eval.py` and, later, "learners also watched".

## Chunking

Fixed 60 s windows at 30 s stride first — the prototype's default, known to
work. Chapter-boundary chunking (YouTube chapters, or embedding-similarity
drops) is a later re-index, not a redesign: windows are keyed per video, so a
video can be re-cut and re-upserted alone.

## Sharing and invalidation

- Two kinds of vectors, deliberately not mixed. **Public video windows**:
  derived from public data, one global namespace shared by every workspace.
  **Accepted-question vectors**: derived from learner behaviour, stored in
  workspace-scoped Vectorize namespaces (or a separate index) so one
  workspace's history never shapes another's hot retrieval. The D1 moment log
  is likewise keyed per workspace.
- A transcript, once it exists, is effectively immutable. **Its absence is
  not.** The negative cache is a record, never a verdict:
  `{videoId, checkedAt, reason}` — a genuine no-captions probe retries after
  weeks; a 429 or network failure retries within hours. A permanent "no
  captions forever" marker would let one transient failure poison the corpus
  for good.
- A deleted video is pruned when playback reports it gone, not on a schedule.
- Every Vectorize row carries `cut` (chunking version), `embeddingModel`,
  `captionLanguage`, `captionKind` (manual/auto when known) and `indexedAt`.
  `cut` makes a chunking change an incremental per-video re-index. The
  embedding model is different: Vectorize indexes have fixed dimensions, so
  replacing bge-m3 is a **new index and a planned migration**, not a metadata
  bump — the field exists so the migration can tell old vectors from new.

## Failure is data

| failure | behaviour |
| --- | --- |
| no captions on a candidate | recommend on title, no window, say contents unverified |
| no captions anywhere | best video honestly, no window |
| YouTube rate-limits the fetch | fall back to already-fetched candidates; say so; short-TTL negative record |
| Vectorize/Workers AI unavailable | warm path degrades to cold; cold path has no such dependency |
| model window fails bounds | refuse the window, keep the video recommendation |

### Caption acquisition is an experimental provider, not a platform fact

There is no supported public API for downloading arbitrary videos' captions:
the official Data API's `captions.download` requires edit permission on the
video. Fetching timed text therefore rides an undocumented endpoint that may
be rate-limited, blocked from cloud IPs, or changed without notice — the
prototype's README warns about exactly this, and it deserves its own terms
review.

So it is a **go/no-go gate, not a verification item**: phase 2 code may be
written against stubs, but nothing ships to learners before a deployed worker
probes 50–100 representative educational videos —
(`probe-captions.mjs` carries an initial 16-video corpus for the local
baseline; the deployed run extends it from the eval set) —
has captions? fetch succeeds from Cloudflare? timed lines parse? auto vs
manual? latency? 429/blocking rate? — before anything else is built. If that
probe fails badly, the architecture changes (Whisper via Workers AI moves from
"deliberately not included" to the acquisition path, at real cost per video).
The caption fetcher itself is isolated behind one module boundary so a
provider change replaces a file, not the pipeline.

## Phases — each ships alone

| phase | delivers | new platform surface |
| --- | --- | --- |
| **2a** | the go/no-go gate: deployed caption probe over 50–100 eval videos | a throwaway probe worker |
| **2** | cold path: captions → lexical window retrieval → one model call over passages → `show_video` | none beyond 2a — HTTP fetches and the existing loop |
| **3** | flywheel: Queue-consumer indexing, bge-m3 retrieval, warm path with recall check | **Vectorize index + Workers AI binding + Queue** on small-cp |
| **4** | hot path: question vectors (workspace namespace) → D1 moment record | none — the table exists from phase 2 |

Phase 3's bindings are shared live state across every worktree — creating the
index and adding bindings is a deploy-coordination event of the same class as
a D1 migration, and needs its own explicit go, separate from code review.

## Deliberately not included

- **Whisper.** Auto-captions cover nearly every talking video. If captionless
  videos ever matter, `@cf/openai/whisper-large-v3-turbo` is one Workers AI
  call away — a phase of its own, not a default cost on every question.
- **The bge-reranker stage.** Needs stored text; at ≤3 verified candidates the
  model is the reranker.
- **Storing transcripts.** The storage rule above.
- **Caching answers.** Questions vary; transcripts and embeddings do not.
  Cache the expensive input, recompute the cheap decision. (The hot path's D1
  log is a record of accepted outcomes, consulted by similarity — not an
  answer cache keyed on the question string.)
- **Pre-indexing YouTube.** Nothing is crawled. The corpus grows only from
  questions learners actually asked, exactly as the prototype refuses bulk
  scraping.

## Verification

- Phase 2 unit: caption parser (timed lines, dedupe of rolling auto-captions),
  window bounds, `show_video` validator refusals (unread video with a window,
  window outside the video, second show in one answer), the captionless
  recommendation path.
- Phase 2 browser check, stubbed: a `video` SSE event opens a card at the
  window; a captionless recommendation opens a card with no window bar tint.
- Phase 2 live-dev (after an approved deploy): measured caption fetch success
  rate over the eval questions in `moment/eval/gold.jsonl`.
- Phase 3 unit: window cutting (60/30 with tail handling), Vectorize row shape
  and `cut` version, recall-threshold fall-through to cold.
- Phase 3 end-to-end, live-dev only: same question twice — the second answer
  must be warm and cite the same video, measurably faster.
- Phase 4: an accepted moment answers a re-asked paraphrase from the log.
