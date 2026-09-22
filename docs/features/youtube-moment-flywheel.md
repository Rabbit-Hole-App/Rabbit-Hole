# YouTube moments — the flywheel (phases 3–4) and the phase-2 gaps

Implementation spec and plan for what remains of
[youtube-moment-recommendation.md](youtube-moment-recommendation.md) after the
phase-2 cold path shipped. That document owns the architecture and the
storage rule (embeddings, never text); this one pins the concrete decisions —
bindings, module boundaries, key shapes, thresholds — so each item is
buildable without reopening the design. Numbers in brackets are the work
items as reviewed.

**All code here is writable and unit-testable now against stubs. Nothing
warm, hot, or indexed serves a learner until the bindings exist — and
creating them on the shared worker is a deploy-coordination event with its
own explicit go, same class as a D1 migration.**

## New platform surface (phase 3 go, one event)

| binding | resource | used for |
| --- | --- | --- |
| `env.AI` | Workers AI | `@cf/baai/bge-m3` embeddings (1024 dims) |
| `env.MOMENTS` | Vectorize index `small-learn-moments`, 1024 dims, cosine | window vectors (namespace `windows`), accepted-question vectors (namespace `questions:<org>`) |
| `env.INDEX_QUEUE` + consumer | Queue `small-learn-index` | corpus warming off the request path |
| `env.RUNS` (exists) | R2 | per-video probe/index records under `learn/moment-index/` |

One Vectorize index, two kinds of namespace — the spec's separation rule.
Public window vectors live in `windows`; learner-history question vectors
live in `questions:<org>` so one workspace's behaviour never shapes
another's retrieval. Every code path takes "binding absent" as "this
temperature is closed": warm and hot degrade to cold, indexing enqueues
nothing, and the cold path itself keeps zero new dependencies.

## The R2 record — negative cache and index ledger in one object [6, 12]

One JSON object per video at `learn/moment-index/<videoId>.json`, our own
observation, nothing of YouTube's:

```json
{ "videoId": "…", "checkedAt": "ISO", "reason": "no-track" | null,
  "cut": 1, "starts": [0, 30, 60], "indexedAt": "ISO" | null }
```

- **Negative half [6].** `fetchCaptions` already produces the reasons; today
  nothing writes them, so a captionless video is re-probed on every
  question. The record is consulted before any caption fetch and written
  after any failed one. TTL is enforced at read time (R2 has no per-object
  expiry): an expired record is treated as absent. Reason → retry-after:
  `rate-limited` 3 h, `blocked` 6 h (transient, must not poison),
  `no-track`/`empty` 21 d (genuinely captionless, worth re-asking rarely),
  `unplayable`/`too-large` 60 d, `deleted` 365 d. A record is a record,
  never a verdict — exactly the spec's wording.
- **Ledger half [12].** Vectorize cannot delete by prefix, so pruning needs
  the vector ids back. Vector ids are deterministic —
  `<videoId>:<cut>:<start>` — and the record's `starts` list reconstructs
  them all. Pruning a deleted video = delete those ids, write
  `reason: "deleted"`.

## Phase-2 gaps, codeable now

**Negative cache wiring [6].** `findVideoMoments` consults the record for
each candidate before fetching captions and writes failures after. Lives in
the new `learn-moment-index.js`, wrapped around `fetchCaptions`, so the
caption module keeps its single job. No binding gate — `RUNS` exists; absent
(unit tests) means plain pass-through.

**Keep / dismiss [7].** The `accepted` column exists; nothing writes it.
- `ask.js` captures `meta.last_row_id` from the existing `learn_moments`
  INSERT and adds `momentId` to the `video` SSE event.
- The card: when a block carries a tutor moment (`momentId` present), two
  quiet actions by the window bar — **Keep** / **Dismiss**. One click, then
  the affordance shows the choice made; a learner can change their mind, the
  latest write wins.
- Route `POST /api/learn/moment-feedback` `{app, momentId, accepted}` →
  `UPDATE learn_moments SET accepted = ? WHERE id = ? AND org = ?` behind
  `authorizedBoardApp`, plus the matching dev-worker route.
- This is what turns the log into a gold set and, later, the hot path.
  When phase-4 bindings exist, an accept also upserts the question vector
  (below); without them it is just the D1 write.

**Success caching stays 1 h [8].** No code. Repeat topics across days
re-fetch by design until vectors carry the weight; noted so nobody "fixes" it.

**Deleted-video signal [12].** The embed is a cross-origin iframe — a dead
video is invisible to us. The observable is a thumbnail probe: the card
renders `i.ytimg.com/vi/<id>/mqdefault.jpg` (it doubles as the pre-play
poster area's corner thumb; deleted videos 404 it). `onError` → one
`POST /api/learn/video-gone` `{app, videoId}` → worker deletes the ledger's
vector ids (no-op without the binding) and writes `reason: "deleted"`.
Client-reported, so the worker treats it as a *signal*: it prunes derived
data only, never the D1 log.

**Gold-set export [10].** `packages/control-plane/export-gold.mjs`: reads
accepted moments via `wrangler d1 execute small --remote --json`, writes
`tests/evals/moment-gold.jsonl` in the prototype's line format
`{"question", "video_id", "start", "end"}`. Hand-run, like the skill eval.

**Eval harness [11].** `tests/evals/moment-eval.mjs` — the prototype's
`run_eval.py` targets the Python pipeline; this targets ours. For each gold
line: question in → `findVideoMoments` + the real model call → `(videoId,
window)` out. Scores: video hit rate, and window IoU
(`overlap / union` of the two spans) on video hits. Needs `EXA_API_KEY` and
`ANTHROPIC_API_KEY` from root `.env` (same pattern as `probe-captions.mjs`);
hand-run before phase promotions, never in CI.

## Phase 3 — the flywheel

**Queue consumer [1].** `learn-moment-index.js` exports the whole unit:

```
indexVideo(videoId, env): record fresh-negative? skip
  → fetchCaptions → cutWindows (60/30, cut=1)
  → embed in batches of ≤50 texts per AI call
  → MOMENTS.upsert(ns 'windows') → write ledger record
consumeIndexQueue(batch, env): indexVideo per message, ack/retry per message
```

Vector rows carry `{videoId, start, end, cut: 1, embeddingModel:
'@cf/baai/bge-m3', captionLanguage, captionKind, indexedAt}` — the spec's
versioning fields. `index.js` grows the `queue(batch, env)` export. Text is
embedded and discarded; nothing quotable lands anywhere.

**Producer [2].** After a cold `find_video_moments`, enqueue one message per
captioned candidate not already indexed (ledger check), `{videoId}` each —
per-video messages so one poison video retries alone. Fire-and-forget send;
absent binding, no send.

**Warm path [3].** In `learn-moment-index.js`:

```
warmMoments(query, env):
  bge-m3(query) → MOMENTS.query(topK 20, ns 'windows', metadata)
  → per-video cap 3 → RECALL_MIN check → null (cold takes over)
  → refetch captions for top ≤3 videos (Cache API usually warm)
  → excerpts: candidate window ±45 s of surrounding lines
  → same {videos, passages} shape the cold path returns
```

`findVideoMoments` tries `warmMoments` first when both bindings exist; any
warm-path error degrades to cold, logged, never surfaced. `RECALL_MIN = 0.55`
as a named constant with the spec's warning attached — it is the one knob
that keeps the flywheel from making answers worse; tuned against the eval
harness, not guessed further.

**Scorer swap [4].** `topPassages(query, videos, { score })` grows the
injection point; the lexical BM25 leg stays as the default and the test
scorer. With `env.AI`, the cold path passes a bge-m3 scorer: embed the
question and all windows, rank by cosine. The window set was going to be
embedded by the consumer anyway; embedding at answer time too is a known
duplicate cost (Queue messages cannot carry 600 vectors) — accepted, cheap,
and it keeps "one function swaps, nothing around it moves" literally true.

**Excerpts [5].** Warm verify hands the model excerpts, not transcripts:
`excerptAround(lines, start, end, pad = 45)` — clamped to the video, merged
when candidate windows of one video overlap. ±45 s pins the spec's 30–60
range; enough to tighten 4:00–5:00 into 4:12–5:38 without rereading a
lecture.

## Phase 4 — the hot path [9]

- On **Keep** with bindings present: embed the question, upsert to
  `questions:<org>` with id `q:<momentId>` and metadata `{momentId}`.
- On a new question, before warm: embed once (the call is shared with warm),
  query `questions:<org>` topK 3. Best score ≥ `HOT_MIN = 0.80` → load that
  moment from D1 (`accepted = 1` rows only).
- **Confirm fit, not auto-show:** the hot candidate joins the tool result as
  a candidate with its original question, window and reason attached —
  `trusted: true`. The model confirms it answers *this* phrasing; the
  epistemic gate extends to `hasPassages || trusted`, because provenance
  here is a learner having accepted exactly this moment, which is stronger
  than a retrieved passage. Hot is fast, not instant: one embedding, one
  vector query, one short confirmation.

## Plan — order of work

Each step lands with its tests green (`make test-unit`) and is committed
alone; steps 1–5 need no bindings and no deploy.

1. **R2 record + negative wiring [6]** — new `learn-moment-index.js`
   (record read/write, TTL table, ledger shape), `findVideoMoments`
   consults/writes. Verify: unit tests for TTL-by-reason expiry math,
   pass-through without `RUNS`, one fetch skipped on a fresh negative.
2. **Keep/dismiss [7]** — `momentId` through ask.js → SSE → card buttons →
   feedback route → D1 update. Verify: route test (update scoped to org),
   learn-chat test (deps object extended — the `new Function` trap),
   `video-check.mjs` gains the buttons and a POST assertion.
3. **Deleted-video signal [12]** — thumbnail probe on the card,
   `/api/learn/video-gone`, ledger-driven vector delete (stub), `deleted`
   record. Verify: unit test for id reconstruction from `starts`; probe
   `onError` path in `video-check.mjs` with a stubbed 404.
4. **Consumer + producer [1, 2]** — `indexVideo`, `consumeIndexQueue`,
   `queue()` export, enqueue after cold. Verify: unit tests with stubbed
   `AI`/`MOMENTS`/queue — row shape carries all five versioning fields,
   batching ≤50, ledger written, poison message acks alone, no-binding
   enqueues nothing.
5. **Warm + scorer + excerpts [3, 4, 5]** — `warmMoments`, scorer injection,
   `excerptAround`. Verify: unit tests for recall fall-through at the
   threshold, per-video cap, excerpt clamp/merge; cold path unchanged under
   the lexical default (existing 23 moment tests stay green).
6. **Hot path [9]** — question-vector upsert on Keep, hot lookup, `trusted`
   gate extension. Verify: unit tests — trusted candidate may carry a
   window, unaccepted moment never returns, below-threshold falls to warm.
7. **Export + eval [10, 11]** — `export-gold.mjs`,
   `tests/evals/moment-eval.mjs`. Verify: export against a seeded local D1;
   eval harness dry-runs on 2–3 hand-filled gold lines.

Deploy-gated, in order, each with its own explicit go: create the Vectorize
index + Queue + `AI` binding (shared-state event); `learn_moments` table on
the dev D1 (announced migration); then the phase-3 live check — same
question twice, second answer warm, same video, measurably faster — and the
phase-4 check — an accepted moment answers a re-asked paraphrase.

## Status

Steps 1-7 are code-complete with green unit tests as of 2026-09-23; nothing
warm, hot, or indexed serves a learner yet. Still deploy-gated, each with its
own explicit go: the Vectorize index + Queue + `AI` binding (shared-state
event), the announced `learn_moments` migration on the dev D1 (until then
keep/dismiss shows on cards but the update 400s), and the live warm/hot
checks. The eval harness (`tests/evals/moment-eval.mjs`) waits on a filled
gold set from `packages/control-plane/export-gold.mjs`.

## Deliberately not in this round

- Whisper, the reranker stage, transcript storage, answer caching,
  pre-indexing — excluded by the parent spec, unchanged.
- Chapter-boundary chunking — a later `cut = 2` re-index, per video.
- Embedding-model migration tooling — `embeddingModel` is recorded so the
  future migration can tell old vectors from new; building it waits for a
  reason.
- Server-verified deletion (re-probing YouTube on a `video-gone` report) —
  the client signal only prunes derived data, so a false report costs a
  re-index, not truth.
