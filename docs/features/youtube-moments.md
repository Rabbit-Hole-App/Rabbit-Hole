# YouTube moments on the lesson canvas

A video is a source like a paper or a Wikipedia article — except the unit is
not a page or a section, it is a **moment**: one video plus the `start → end`
window that answers a question. The design comes from the `moment/` prototype
in this repo, whose pipeline is discover → transcribe → retrieve → answer.

This spec is **phase 1**: the learner finds a video and puts it on the canvas,
and a card can display a moment. Phase 2 — the tutor proposing a moment with a
`show_video` tool — needs transcript retrieval the worker cannot run today
(the prototype's rerank stage alone is 2.5 GB of models) and gets its own spec.

## Terms

- **Video** — one YouTube video, identified by its 11-character id.
- **Moment** — a `{start, end}` window in seconds within one video. `end` may
  be null: "from 4:12" is a moment; a whole video is `start = 0, end = null`.
- **Video card** — a canvas block playing one video, opened at its moment.

## What the learner does

Sources ▸ *YouTube video…* opens the same type-ahead the Wikipedia picker uses
(250 ms debounce, 2-character minimum, aborted in flight). Discovery is **Exa**
restricted to `youtube.com` — semantic, so *"how does backpropagation work
intuitively"* finds the 3Blue1Brown video by meaning, verified against the live
API. Results show title and channel; anything without an 11-character video id
(channel and playlist pages) is dropped, as the prototype's `_video_id` does.

Picking one drops a video card on the canvas.

## The card and the timeline

A YouTube embed is a cross-origin iframe: **nothing can be drawn on YouTube's
own scrubber**. The moment is shown in two ways that are actually possible:

- The embed URL carries the window: `youtube.com/embed/{id}?start=S&end=E`.
  Playback begins at `start` and stops at `end` — the window is enforced by
  playback, not annotation.
- **Our own window bar** under the player: a strip for the full timeline with
  the moment tinted and `m:ss` labels at each edge. Clicking the bar reloads
  the embed at that time (plain URL parameters, no YouTube JS API). When the
  duration is unknown — Exa does not return one — the bar spans
  `max(end * 1.25, end + 60)` seconds and says so by omitting the total label.

The card follows the PDF card's iframe rules: pointer events off until the
card is selected, or a focused player swallows the canvas's copy, paste, undo
and delete. Block shape: `{type: 'video', videoId, start, end, title, channel,
w?, h?}` — small strings and numbers only, safe for the canvas save path.

## Where the search runs

In the worker, at `/api/learn/youtube`, behind `authorizedBoardApp` like every
Learn route. The Exa key is a worker secret (`env.EXA_API_KEY`); it never
reaches the browser. One `POST https://api.exa.ai/search` with
`includeDomains: ["youtube.com"]`, `numResults: 10`, 20 s timeout. Exa is
find-only, exactly as the prototype's AGENTS.md warns: it never returns
durations or timestamps.

| failure | the learner sees |
| --- | --- |
| missing key | `YouTube search is not connected on this deployment.` |
| 401/403 | `The Exa search key was refused.` |
| 429 | `Video search is rate-limited. Wait a minute and try again.` |
| other | `Video search is unavailable (status)` |

## What the agent is given

`video_context {videoId, start, end, title}` rides with a question while a
video card is the learner's focus, after `paper_context` and `wiki_context` in
precedence — one context rides at a time, and a reader the learner opened
outranks a card. The context tells the model what the learner is watching and
the window on screen; it does **not** include a transcript (phase 2). The
instruction says so, so the model asks about the moment rather than inventing
quotes from it.

Each card registers one source `{id: 'video:<blockId>', kind: 'video'}`;
detaching omits `video_context`, as for wiki sources.

## Deliberately not included

- The YouTube IFrame JS API. Reloading the embed URL covers seek; the API adds
  a script from a third origin for a progress cursor we can live without.
- Transcripts, `show_video`, and everything else in phase 2.
- Autoplay. A canvas full of cards must never start making noise on its own.
- YouTube Data API metadata (durations, view counts). Needs its own key and
  quota; the window bar's unknown-duration fallback is enough until then.

## Verification

Unit: the Exa response parser (id extraction, page-dropping), the embed URL
builder (window clamping, integer seconds), the window-bar geometry, and the
`video_context` validator including refusals.

Browser check, stubbed: picking a search result puts a card on the canvas; the
embed src carries `start` and `end`; the window bar shows the moment and a
click on it moves `start`; the card survives a reload; a question asked while
a card is focused carries `video_context`; detaching the source stops it.
