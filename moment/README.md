# moment

Ask a question → get **one** YouTube video and the exact `start`/`end` window that answers it.

```
$ moment "how do I sharpen a chef's knife on a whetstone"

Knife Sharpening 101 — Cook's Illustrated
4:12 → 5:38   (confidence 0.86)
https://www.youtube.com/watch?v=XXXX&t=252s

He demonstrates holding the blade at ~15° ...
Why this one: only candidate that shows the full stroke on both sides.
```

`--json` adds `embed_url` (`youtube.com/embed/ID?start=..&end=..`) for a player.

---

## Setup (for humans and coding agents)

Requirements: Python 3.10+, internet access to YouTube, an Anthropic API key.
Optional: `ffmpeg` on PATH if you enable Whisper fallback.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install -e .                       # installs the `moment` CLI
cp .env.example .env                   # then put your ANTHROPIC_API_KEY in it
export $(grep -v '^#' .env | xargs)    # or export ANTHROPIC_API_KEY=... directly

# optional: use Exa for candidate discovery (needs EXA_API_KEY, ~$5 / 1k searches)
export MOMENT_DISCOVER=exa EXA_API_KEY=...

# optional: transcribe videos with no captions (slow, needs ffmpeg)
pip install -r requirements-whisper.txt
```

First run downloads two models from Hugging Face (~2.5 GB total):
`BAAI/bge-m3` (embeddings) and `BAAI/bge-reranker-v2-m3` (reranker). A GPU is
not required; CPU works, just slower. To go lighter, set
`MOMENT_EMBED=BAAI/bge-small-en-v1.5` and `MOMENT_RERANK=BAAI/bge-reranker-base`.

### Run

```bash
moment "your question here"
moment --json "your question here"       # machine-readable
python -m moment.cli "your question"      # without installing the entry point
python -m moment.discover "your question" # debug: just list candidate videos
```

### Test

```bash
pip install -r requirements-dev.txt
pytest -q tests            # offline unit tests, no network/models/LLM needed
```

### Evaluate

Fill `eval/gold.jsonl` with questions and the known-good `(video_id, start, end)`, then:

```bash
python eval/run_eval.py            # end-to-end: video hit@1 and window IoU
python eval/compare_discovery.py   # discovery only: is the gold video in the candidate set? ytdlp vs exa
```

---

## How it works

| step | file | what it does | origin |
|---|---|---|---|
| 1 | `discover.py` | Candidate videos, pluggable via `MOMENT_DISCOVER`: **`ytdlp`** (default) = LLM expands the question into 4 YouTube searches run through `yt-dlp`, no key; **`exa`** = one Exa neural search restricted to `youtube.com` (meaning-based, no LLM call); **`both`** = union. Skips Shorts (<45 s) and >3 h videos. | ours |
| 2 | `transcribe.py` | Timed captions via `youtube-transcript-api` (manual EN preferred, then auto). Rolling-caption dedupe. Disk cache in `~/.cache/moment`. Whisper fallback if installed. | OSS libs |
| 3 | `retrieve.py` | 60 s sliding windows (30 s stride) → BM25 + dense (`bge-m3`) → RRF fusion → cross-encoder rerank → top 8, max 2 per video. | OSS models |
| 4 | `answer.py` | LLM sees each candidate with per-line timestamps plus 6 lines of context each side, picks ONE, returns tight `[start, end]`, summary, reason, confidence. Bounds are sanity-checked and padded 1.5 s. | ours |
| — | `llm.py` | Anthropic client + JSON helper. Swap for Bedrock/OpenAI/local here. | ours |
| — | `models.py` | Dataclasses and all tuning knobs. | ours |

Nothing is pre-indexed. Candidates are fetched per question and cached, so a
repeat topic is fast and there is no bulk scraping of YouTube.

## Discovery backends

| backend | how | pros | cons |
|---|---|---|---|
| `ytdlp` | LLM → 4 keyword queries → `yt-dlp ytsearch` | free, returns duration/channel | keyword matching, 1 LLM call, ~5 s |
| `exa` | `exa.search(q, include_domains=["youtube.com"])` | semantic match on meaning, 1 HTTP call | paid, no duration (fetched separately), no transcripts/timestamps |
| `both` | union | best recall | slowest |

Exa only *finds* videos. It never returns transcripts or start/end times; those
always come from steps 2–4. Run `eval/compare_discovery.py` to decide which
backend wins on your question set.

## Tuning knobs (`moment/models.py`)

- `N_QUERIES`, `N_PER_QUERY` — recall vs. latency (default 4 × 10)
- `CHUNK_TARGET_S`, `CHUNK_STRIDE_S` — moment granularity (60 / 30)
- `TOP_RETRIEVE`, `TOP_RERANK` — fusion pool and how many moments the LLM compares (40 / 8)
- `MAX_DURATION_S` — drop very long videos (3 h)
- env `MOMENT_DISCOVER`, `MOMENT_EXA_RESULTS` — discovery backend and Exa result count

## Known rough edges (things a coding agent may need to fix on first run)

1. `youtube-transcript-api` changed its interface in 1.x; `transcribe._from_captions`
   is written against 1.x (`YouTubeTranscriptApi().list(id)` / `.fetch()` returning
   objects with `.text/.start/.duration`). If you get an AttributeError, adapt there.
2. YouTube may rate-limit caption fetches from cloud IPs. Lower `workers` in
   `load_transcripts`, or add a proxy via `YouTubeTranscriptApi(proxy_config=...)`.
3. `yt-dlp` search occasionally returns entries with `duration=None`; those are kept.
4. The first call on a fresh machine is slow (model download + ~30 caption fetches).
5. `exa-py` API surface moves quickly; `discover_exa` uses `exa.search(query, include_domains=,
   num_results=, type="auto", contents=False)` (exa-py 2.x). If a kwarg is rejected, check
   `Exa.search` signature and adjust there only.
6. Exa results for youtube.com can include channel/playlist pages; `_video_id` drops
   anything without an 11-char video id.

## Roadmap / next steps

- Web UI with the embedded player at `embed_url` (FastAPI + one HTML page)
- Topic-boundary chunking (embedding-similarity drops or YouTube chapters) instead of fixed windows
- Return top-3 alternates alongside the winner
- Conversational follow-ups (rewrite question with chat history before discovery)
- Scoped search ("Knowledge Bases"): restrict discovery to given channels/playlists
- Visual moments: SigLIP frame embeddings for non-speech queries
