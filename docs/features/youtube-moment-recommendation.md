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
system persists is derived numbers and coordinates, nothing quotable.

| stored durably | contains | ToS exposure |
| --- | --- | --- |
| Vectorize | vectors + `{videoId, start, end}` metadata | none — numbers and timestamps |
| R2 | a "no captions" marker per probed video | none — a boolean |
| D1 | chosen moments: question, videoId, window, confidence, accepted | none — our own log |

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
2. Fetch timed captions for up to 5 candidates, best-effort. YouTube serves
   captions, including auto-generated ones, over plain HTTP; no Whisper, no
   audio. A candidate without captions stays in the running on title alone.
3. One model call reads all fetched transcripts with per-line timestamps and
   picks **the video and its window together**, plus a confidence and a
   one-line reason — the prototype's `answer.py` contract.
4. `show_video(videoId, start, end)` travels back over SSE and lands on the
   existing card (`insertVideo` already takes a moment). The chosen moment is
   written to the D1 log from day one — phase 4 only starts *reading* it.
5. **In the background** (`ctx.waitUntil`, learner never waits): each fetched
   transcript is cut into 60 s windows at 30 s stride, embedded with
   `@cf/baai/bge-m3`, and upserted to Vectorize as `videoId:windowN` with
   `{videoId, start, end}` metadata. The text is then discarded.

The gate on `show_video` is the same bargain `show_paper` and `show_wikipedia`
strike: only a video whose transcript was read this answer (or that arrived as
`video_context`) may be shown **with a window**. A captionless video may be
recommended, window-less, with an honest "couldn't verify contents". The
phase-1 instruction — *you have no transcript, never invent quotes* — is
deleted only for videos whose transcript the model actually read.

### Warm

1. Embed the question (one bge-m3 call).
2. Vectorize query, topK ≈ 20, max 2–3 windows per video — the prototype's
   per-video cap, so one long lecture cannot crowd out the field.
3. **Recall check**: if the best score is below the corpus threshold, fall
   through to cold — the index does not cover this topic yet, and a mediocre
   indexed answer must never beat a fresh search. This threshold is the one
   knob that keeps the flywheel from making answers worse.
4. Refetch captions for the top 2–3 videos; the model verifies, tightens the
   window, answers.

### Hot

Before anything: embed the question and compare against the D1 moment log's
accepted answers (their questions are embedded too, in the same index under a
`question:` namespace). A strong match returns the logged moment immediately,
with the model asked only to confirm fit. The log also becomes, for free, a
growing gold set for `moment/eval/run_eval.py` and, later, "learners also
watched".

## Chunking

Fixed 60 s windows at 30 s stride first — the prototype's default, known to
work. Chapter-boundary chunking (YouTube chapters, or embedding-similarity
drops) is a later re-index, not a redesign: windows are keyed per video, so a
video can be re-cut and re-upserted alone.

## Sharing and invalidation

- The vector index and "no captions" markers are derived from public data:
  **one global index, all workspaces**. The D1 moment log records learner
  behaviour: **keyed per workspace**. (Stated default — flag if wrong.)
- Captions are effectively immutable; nothing expires. A deleted video is
  pruned when playback reports it gone, not on a schedule.
- Every Vectorize row carries a `cut` version, so a chunking change re-indexes
  incrementally, video by video.

## Failure is data

| failure | behaviour |
| --- | --- |
| no captions on a candidate | recommend on title, no window, say contents unverified |
| no captions anywhere | best video honestly, no window |
| YouTube rate-limits the fetch | fall back to already-fetched candidates; say so |
| Vectorize/Workers AI unavailable | warm path degrades to cold; cold path has no such dependency |
| model window fails bounds | refuse the window, keep the video recommendation |

The prototype's README warns that cloud IPs get rate-limited fetching
captions. That is the one risk only a deployed worker can measure, and it is
why the caption fetcher ships behind small concurrency with per-video Cache
API absorption, and why phase 2's verification explicitly includes a live-dev
measurement of caption fetch success rate.

## Phases — each ships alone

| phase | delivers | new platform surface |
| --- | --- | --- |
| **2** | cold path: captions → one model call → `show_video` over SSE onto the existing card | none — HTTP fetches and the existing loop |
| **3** | flywheel: background embedding + Vectorize, warm path with recall check | **Vectorize index + Workers AI binding** on small-cp |
| **4** | hot path: question-embedding lookup over the D1 moment log; self-growing gold set | none — the table exists from phase 2 |

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
