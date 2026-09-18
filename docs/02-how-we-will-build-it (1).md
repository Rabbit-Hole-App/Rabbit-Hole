# How We Will Build It: An AI Lecturer That Writes Like Andrew Ng

*Live handwritten explanations from an AI agent — on a whiteboard, in sync with a voice, savable as video. Input is a topic, a document, or a codebase.*

---

## 1. Product definition

**What the user sees.** A whiteboard. A calm voice starts explaining. A pen appears and writes an equation symbol by symbol, sketches a diagram, circles a term in red — at human speed, in time with the words. Typed headings and images appear where a lecturer would have them on a slide. The user can pause, scrub, ask a question out loud, or write on the board themselves. At the end, they can download the session as an MP4.

**What the system does.** An agent turns source material into a *lecture script* of timed beats; a handwriting engine turns each beat's text and maths into timed pen strokes; a voice engine narrates with word timestamps; a canvas replays ink and audio on a shared clock; a renderer replays the same log into video.

**Interactive requirement.** At any point the user can pause, draw or circle on the board with a pen, ask a question, and the agent answers by writing on the same canvas beside the user's mark; the lecture then resumes (see §6).

**Non‑goals for v1.** Talking‑head avatar; multiplayer; mobile‑native app; languages other than English.

---

## 2. Architecture

```
                 ┌──────────────────────────────────────────────────────────┐
                 │                     INPUT LAYER                          │
                 │  topic / markdown / PDF / GitHub repo (tree-sitter walk) │
                 └───────────────────────────┬──────────────────────────────┘
                                             ▼
                 ┌──────────────────────────────────────────────────────────┐
                 │              LECTURE AGENT (Claude, tool use)            │
                 │  Writer → "make it drawable" Editor → Layout Designer    │
                 │  emits beats: say / write / sketch / plot / image /      │
                 │               underline / circle / new_page             │
                 └───────────────────────────┬──────────────────────────────┘
                                             ▼
        ┌──────────────────┬─────────────────┼─────────────────┬──────────────────┐
        ▼                  ▼                 ▼                 ▼                  ▼
  Handwriting svc    Math → strokes    Diagram → strokes   Voice (TTS +      Images / typed
  (Graves/Transformer  (MathJax SVG →   (rough.js paths,    char timestamps)  text (fade-in,
   on IAM-Online)       centreline,      sampled plots)     ElevenLabs        rough frame)
                        ordered)
        └──────────────────┴─────────────────┴─────────────────┴──────────────────┘
                                             ▼
                 ┌──────────────────────────────────────────────────────────┐
                 │          TIMELINE ENGINE (Node, ~300 lines)              │
                 │  assigns t to every pen point; aligns stroke groups      │
                 │  to narration spans; produces an immutable session log   │
                 └───────────────┬───────────────────────────┬──────────────┘
                                 ▼                           ▼
                 ┌────────────────────────┐    ┌──────────────────────────────┐
                 │  LIVE CLIENT (tldraw)  │    │  VIDEO RENDER (Remotion)     │
                 │  WebSocket stream,     │    │  same log, frame = f(t),     │
                 │  draw shapes grow as   │    │  audio muxed, MP4 to S3      │
                 │  t advances; user ink  │    └──────────────────────────────┘
                 │  + voice questions     │
                 └────────────────────────┘
```

**Shapes, not frames.** The lecture is stored and played as a timeline of canvas shapes, never as pre‑rendered video, so it can be paused and drawn on at any instant (§6).

**Single source of truth:** the session log — an ordered list of beats, each with narration audio, word timestamps, and stroke groups whose every point carries a `t`. Live playback and video export both read it; nothing is rendered twice differently.

---

## 3. Tech stack (final picks)

| Layer | Pick | Why | Link |
|---|---|---|---|
| Canvas | **tldraw SDK** | Stroke‑native `draw` shape, programmable Editor API, frames, camera, user ink on same board. | https://tldraw.dev |
| Ink rendering | **perfect‑freehand** | Pressure‑tapered marker ink; what tldraw uses internally. | https://github.com/steveruizok/perfect-freehand |
| Prose handwriting | **Hand Magic** (MIT) — fork; Graves LSTM + Transformer on IAM‑Online, style priming | Returns `(x, y, pen_up)` sequences; FastAPI server included. Fallback: sjvasquez/handwriting‑synthesis. | https://hand-magic.com · https://github.com/sjvasquez/handwriting-synthesis |
| Maths handwriting | **MathJax → SVG → centreline strokes** (own code) | Models above only know English prose. Deterministic, legible, ordered like a human writes. Later: fine‑tune on CROHME. | https://www.mathjax.org |
| Diagrams | **rough.js** | Sketchy boxes, arrows, axes as paths. Plots = sampled polylines. | https://roughjs.com |
| Agent | **Claude API** with tool use; scaffold from **tldraw Agent Starter Kit** | Starter kit already streams canvas actions incrementally. | https://tldraw.dev/starter-kits/agent |
| Voice out | **ElevenLabs** `/text-to-speech/{voice}/with-timestamps` | Character‑level timing for ink/voice sync. | https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps |
| Voice in | Browser STT for v1; **ElevenLabs Scribe** for quality | Student questions. | https://elevenlabs.io/docs |
| Reading student ink | **Mathpix** (maths) or vision LLM on canvas snapshot | For "check my work" mode. | https://mathpix.com |
| Video | **Remotion** (+ Lambda for scale) | Deterministic per‑frame render, audio mux; tldraw+Remotion starter exists. Fallback: Playwright + ffmpeg. | https://www.remotion.dev · https://github.com/Octoframes/tldraw-remotion-animation |
| Code ingestion | **tree‑sitter** + file walker + LLM summaries | Extract abstractions, data flow, key signatures from a repo. | https://tree-sitter.github.io |
| App | Next.js + TypeScript, WebSocket (Socket.IO), Postgres, S3/R2, **Inngest** jobs | Boring and reliable. | https://www.inngest.com |

**Licensing note.** tldraw and Remotion require commercial licences for company deployment. Fully‑MIT alternative: plain `<canvas>` + perfect‑freehand for display, Playwright + ffmpeg for export. Decide before week 3.

---

## 4. The lecture agent

### 4.1 Beat schema
```json
{
  "id": "b12",
  "say": "So the cost function is just the average of these squared errors.",
  "do": [
    { "op": "write", "kind": "latex", "src": "J(w,b)=\\frac{1}{2m}\\sum_{i=1}^{m}(\\hat y^{(i)}-y^{(i)})^2", "at": "below", "sync": "cost function" },
    { "op": "circle", "target": "\\hat y^{(i)}-y^{(i)}", "color": "red", "sync": "squared errors" }
  ]
}
```
Ops: `say`, `write` (kind: text | latex), `sketch` (primitives: box, circle, arrow, arc, axis, brace), `plot` (f, domain), `image` (url, caption), `heading` (typed), `underline`, `circle`, `erase`, `new_page`, `camera` (pan/zoom). Each op may carry `sync`: the narration phrase its ink should coincide with.

### 4.2 Three‑stage generation (copied from the whiteboard‑explainer pattern)
1. **Writer** — produces the narrative in Ng's beat arc: motivate → instance → picture → formula → generalise → intuition check → recap.
2. **Editor ("make it drawable")** — rewrites every sentence so it has one drawable object; splits anything that would take > 12 s of pen time; inserts pauses.
3. **Layout designer** — assigns positions (a virtual page grid, flowing downward), colours, camera moves; enforces the twelve style rules below.

### 4.3 Style rules baked into the system prompt (from the research doc)
1. Instance → picture → formula → generalisation; never open with the general formula.
2. Draw the picture before the equation it explains.
3. Typed text only for headings/labels; all derivations handwritten.
4. Prose 2–3 chars/s; maths slower; narration fills pen time with the *why*.
5. Ink and voice share a clock.
6. Black = content, red = term under discussion, blue = side notes.
7. Zoom‑to‑unit moves ("just one neuron…").
8. Conversational second person.
9. Recap + boxed result every 4–6 minutes.
10. No decorative strokes.
11. No avatar; pen cursor + voice.
12. Segments under six minutes.

### 4.4 Codebase → lecture specifics
- Walk the repo; rank files by fan‑in/fan‑out and recency; summarise top N with the LLM.
- Pick 3–5 core abstractions; express data flow as one hand‑drawn boxes‑and‑arrows diagram.
- Handwrite the one or two central signatures or formulas (loss, scoring, rate‑limit maths).
- Typed headings = file/module names; handwritten = how it works.

---

## 5. The handwriting engine (the part nobody ships)

### 5.1 Stroke format
```ts
type Point = { x: number; y: number; p: number; t: number }   // p = pressure 0..1, t = seconds from beat start
type Stroke = { points: Point[]; color: "black"|"red"|"blue"; width: number }
type StrokeGroup = { id: string; strokes: Stroke[]; sync?: string; bbox: Box }
```

### 5.2 Sources
- **Prose:** Hand Magic service → pen sequences in writing order. Style primed once per voice/persona.
- **Maths:** MathJax → SVG glyph outlines → skeletonise to centrelines → order strokes left→right, top→bottom, fraction bar before numerator/denominator, Σ before limits → light jitter so it matches the RNN hand.
- **Diagrams:** rough.js path → resample at 2 px spacing.
- **Plots:** sample f(x) at 200 points → one stroke; axes and ticks first.

### 5.3 Timing model (assigns `t`)
- Base pen speed 400 px/s; scale by 0.6 on high curvature; 1.2 on straight lines.
- Pen‑lift gap 80 ms between strokes; 250 ms between words; 400 ms before a fraction bar or big operator.
- If a group has `sync`, stretch/compress its total duration to end ~150 ms before the matching narration span ends (lecturers finish writing a term as they say it).
- If ink would exceed the span by > 40 %, the Editor stage inserts a spoken pause rather than speeding the pen.

### 5.4 Rendering
- tldraw `draw` shape per stroke; on each animation frame, expose points with `t ≤ now`; perfect‑freehand tapers the leading edge so the current stroke looks wet.
- Pen cursor dot at the latest point; optional hand‑shadow sprite.
- Camera follows the writing baseline; pans on new lines, zooms 1.3× on `circle`/`underline` ops.

---

## 6. Interactive mode: pause, draw, ask, get a handwritten answer

**Requirement.** At any moment the user can stop the lecture, pick up a pen, circle or sketch something on the board, ask a question (voice or text), and the agent answers by *writing on the same canvas*, next to the user's mark. Then the lecture resumes.

**Why it is possible.** The lecture is never a video while it plays; it is a timeline of tldraw shapes. Pausing just stops the clock. Every stroke already on screen is a live, selectable, hit‑testable shape, so user ink and agent ink coexist on one board. (If we ever pre‑rendered frames we would lose this feature — hence the "shapes, not frames" rule in §2.)

### 6.1 Flow

1. **Pause.** Timeline engine freezes `t`. Audio stops. Board stays editable.
2. **User draws.** Pen tool creates ordinary `draw` shapes tagged `author: user`, in a distinct colour (green by default).
3. **User asks.** Mic → STT (browser STT v1, ElevenLabs Scribe later) or typed text.
4. **Agent context** (the key step):
   - a **viewport screenshot** so a vision model literally sees the circle;
   - a **structured shape list** with bounding boxes and, for lecturer ink, the original `latex`/`text` source of each group;
   - a **hit‑test**: which lecturer groups intersect or sit inside the user's new ink → resolves "why this?" to "the `1/2m` term in the cost function";
   - the **current beat** and the last ~6 beats of narration;
   - optional **Mathpix** parse of any maths the user wrote.
   The tldraw Agent Starter Kit already implements the screenshot + blurry/focused shape context pattern.
5. **Agent answers by writing.** Emits a short beat (≤ 3 ops, ≤ 30 s of ink): `say` + `write`/`sketch`/`underline`, with positions relative to the user's mark — `at: right_of(<userShapeId>)` or `below`. It may annotate the user's ink directly (arrow from their circle to the relevant line; red ✓ or ? beside a step).
6. **Same pipeline as the lecture:** handwriting engine → timed strokes; TTS → audio + timestamps; timeline aligns; WebSocket streams chunks; pen starts moving within ~1.2 s.
7. **Resume.** The Q&A beats are stored as a **branch** in the session log anchored to the pause point. Play continues the original lecture. Export can include the detour or the clean lecture.

### 6.2 Design details
- **Reserved margin.** The layout designer keeps a right‑hand Q&A column on every page so answers never overwrite lecture ink.
- **Short by default.** If a question deserves a longer detour, the agent asks "want me to go into that?" and spawns a sub‑lecture beat sequence.
- **Check‑my‑work.** If the user wrote maths, Mathpix returns it; the agent verifies (symbolically via SymPy where possible) and underlines the exact wrong step.
- **Undo/erase.** User can erase their own ink; agent ink from a Q&A branch can be collapsed with one tap.
- **Latency budget.** Agent first token ~600 ms · TTS first audio ~400 ms · strokes + network ~200 ms → ~1.2 s question‑end to pen‑moving. Cover it with a spoken "okay, let's look at that" and a small pen "thinking" wiggle.

### 6.3 Session log branch shape
```json
{ "type": "qa_branch", "anchor_beat": "b12", "anchor_t": 41.8,
  "user_ink": ["shape_u1","shape_u2"], "question": "why is there a 1/2 here?",
  "beats": [ { "say": "...", "do": [ {"op":"write","kind":"latex","src":"\\frac{d}{dw}\\tfrac12 e^2 = e\\,\\tfrac{de}{dw}","at":"right_of(shape_u1)"} ] } ] }
```

---

## 7. Video export

- Remotion composition takes the session log; `frame → t = frame / fps`; renders ink with `t ≤ t_frame`, camera at `t_frame`, audio track from concatenated TTS segments.
- 1080p30, H.264, ~1 min render per 10 min lecture on Lambda.
- Optional hand overlay and paper texture applied only at export.

---

## 8. Build plan: MVP → V1 → Final

Each task has an owner‑sized scope (1–5 days) and a definition of done. Phases are cumulative.

### Implementation checkpoint — 2026-09-16

Current delivery: the existing Small **Learn** tab on
[regular dev](https://small-cp-dev.zeroshothq.workers.dev/apps/yolo-s3-job?tab=learn).
This includes the scripted visual prototype and an owner-approved curriculum
with a generated first lesson. It is not yet the narrated, generated-handwriting
product described above. We reused Small's
React/Vite frontend and Cloudflare backend; no separate Next.js application was
created. Detailed implementation and test evidence:
[Coaching / Learn delivery record](docs/features/coaching.md#three-pages-and-a-scrub-timeline).

Completed in the current prototype:

- [x] Learn tab, enlarged canvas layout, breadcrumbs, and return navigation.
- [x] tldraw canvas with editable learner drawings (adapted task 0.1).
- [x] Separate Learn Agent conversations and history.
- [x] Three actual pages: logistic regression introduction, its formula, and sigmoid.
- [x] Scripted character-by-character text and progressively drawn plots.
- [x] Continuous Play across pages, Pause, Back, and two-click Next: finish a
  partial page first, then advance.
- [x] Page number/title and a timeline that scrubs within and between pages,
  leaving playback paused (visual portion of task 1.9).
- [x] Preserve learner drawings on their own page during navigation and scrubbing.
- [x] Pause when typing a question, selecting, or starting a region selection.
- [x] Semantic shape metadata, current bounds, related objects, and current
  page/animation context for questions.
- [x] Explicit selection and drag-ellipse targeting with confirmation.
- [x] Removable canvas thumbnail with a bold red target marker. UI-only:
  the image is not sent to Claude.
- [x] Claude answers general and selected-object questions in chat, using the
  existing app permissions and with no action tools.
- [x] Stale-answer guards and replay/navigation cleanup.
- [x] Regular dev deployment and focused browser/backend/geometry checks.
- [x] Owner interview: audience, goal, prior knowledge, and duration.
- [x] Dedicated Curriculum Agent: outcomes, topics, principles, prerequisites,
  exclusions, time allocation, and assessment criteria; separate planning/review
  prompt with no slide or teaching-style instructions. See the
  [research and contract](docs/features/curriculum-agent.md).
- [x] Saved course brief and source-informed curriculum; edit, reorder, remove,
  request revisions, and approve before generating content.
- [x] Bounded JSON validation and generation of the first approved lesson.
- [x] Generated pages reuse playback, scrubbing, selection, and region questions.
- [x] Course content reloads; edits invalidate approval and generated pages.
- [x] Real synthetic model calls and functional checks recorded in
  [Learn curriculum results](docs/testing/learn-curriculum-results.md).

Still required for the original milestones:

- [ ] Complete lecture/beat schema (remaining 1.1). Generated page JSON is
  validated and persisted; the full original operation/beat set is not implemented.
- [ ] Full lecture generation (remaining 1.2). The approved curriculum's first
  lesson is generated; subsequent lessons and free-topic lectures are future work.
- [ ] Real prose/math pen strokes, pen cursor, and stroke timing (0.2–0.4, 1.7).
  Text currently appears in a handwriting-style font; this is not stroke synthesis.
- [ ] Voice output, timestamps, and a shared audio/ink clock (1.3–1.4).
- [ ] Streaming lecture generation (1.5), full heading/image operations (1.6),
  and the complete diagram-operation set (1.8).
- [ ] Save/reload drawings and playback state (remaining 1.10). Course brief,
  curriculum, approval, and generated lesson content now persist in D1.
- [ ] Generated layouts with a reserved Q&A margin (2.3), explicit user-ink
  author tagging and distinct default color (remaining 2.4).
- [ ] Screenshot input to Claude or interpretation of arbitrary learner ink
  (remaining 2.5). Sending preview images is not enabled by the current scope.
- [ ] Agent answers written on the canvas, voice questions, and Q&A branches
  anchored to the lesson timeline (2.6–2.7).
- [ ] Generated teaching/style pipeline, lecture sharing, video export,
  source ingestion, verification, and the remaining Phase 2/3 tasks.
- [ ] Saved lecture share links (remaining 2.9); current links open an app's
  Learn tab under app permissions. The supplied tldraw key is configured, but
  the Remotion licensing/export decision is still open (remaining 2.10).
- [ ] All original phase gates and learning/latency/handwriting evaluations.

**Current increment delivered:** owner brief → editable curriculum → approval →
first generated lesson. Application code positions and animates validated text,
equation, text-diagram, and question blocks; it never executes generated JavaScript.
The existing sigmoid plot demo remains available. This partially implements 1.1,
1.2, and 1.10 without claiming the original narrated-lecture milestones.

**Next proposed increment:** review a real app's curriculum and first lesson with
its owner, measure grounding and audience fit, then decide whether to add remaining
lessons or richer diagrams. Voice, pen strokes, and multiple courses remain separate
future work; this document does not authorize implementing them.

The task tables below retain the original acceptance criteria. **Partial** means
some behavior exists in the visual prototype; it does not satisfy the full row.
**Done (adapted)** records the approved reuse of Small's existing application.

### Phase 0 — Spike (1 week) · "Does live handwriting feel real?"
| Status | # | Task | Done when |
|---|---|---|---|
| Done (adapted) | 0.1 | Next.js app with tldraw canvas | Board renders; user can draw with pen. |
| Partial | 0.2 | Timed‑point replay loop | Hard‑coded stroke JSON with `t` replays via `requestAnimationFrame`; pen cursor leads the ink. |
| Not started | 0.3 | Hand Magic service (fork, FastAPI) | `POST /strokes {text, style}` returns `(x,y,pen_up)`; runs on one GPU or CPU. |
| Not started | 0.4 | Timing model v1 | Assigns `t` (400 px/s, lifts, word gaps); a sentence writes itself at ~2.5 chars/s. |
| Not met | **Gate** | 5 people watch a 20‑s clip and say it "looks handwritten live." | |

### Phase 1 — MVP (weeks 2–5) · "A topic becomes a narrated handwritten lecture"
| Status | # | Task | Done when |
|---|---|---|---|
| Partial | 1.1 | Beat schema + validator (Zod) | Invalid beats rejected; fixtures for every op. |
| Partial | 1.2 | Lecture agent v1 (Claude tool use, single stage) | Topic → 8–15 beats with `say` + `write`(text). |
| Not started | 1.3 | ElevenLabs with‑timestamps integration | Audio + char timestamps stored per beat. |
| Not started | 1.4 | Sync engine | Stroke groups stretched to narration spans; median drift < 200 ms. |
| Not started | 1.5 | WebSocket streaming | Chunks `{groupId, points[]}`; client starts drawing within 300 ms of first chunk. |
| Not started | 1.6 | Typed headings + image op | `heading` renders typed text; `image` fades in with rough.js frame. |
| Not started | 1.7 | MathJax → strokes v1 | LaTeX renders as ordered centreline strokes; legible at 1080p; fractions, sums, sub/superscripts ordered correctly. |
| Partial | 1.8 | rough.js sketch + plot ops | Box, arrow, axis, circle, f(x) plot draw as strokes. |
| Partial | 1.9 | Pause / play / scrub | Clock control; scrub re‑renders ink at any `t`. |
| Partial | 1.10 | Session log persistence (Postgres + S3) | Reload a session and replay it. |
| Not met | **Gate** | A 5‑minute lecture on "linear regression cost function" plays end‑to‑end with voice, handwriting, one diagram, one plot. | |

### Phase 2 — V1 (weeks 6–9) · "It teaches like Ng, you can talk back, and you can download it"
| Status | # | Task | Done when |
|---|---|---|---|
| Not started | 2.1 | Three‑stage agent (Writer → Editor → Designer) | Beats follow the Ng arc; no beat > 12 s ink; recap/box every ≤ 6 min. |
| Not started | 2.2 | Twelve style rules in system prompt + lint | Automated checks: formula never before picture; colour roles; typed vs handwritten. |
| Partial | 2.3 | Layout engine with Q&A margin | Pages flow downward; right column reserved; camera follows baseline. |
| Partial | 2.4 | **Interactive: user ink tagging + pause hooks** | User strokes tagged `author:user`, distinct colour, hit‑testable. |
| Partial | 2.5 | **Interactive: agent context builder** | Screenshot + shape list + hit‑test + last beats assembled per question. |
| Partial | 2.6 | **Interactive: voice/text question → handwritten answer** | Pen moves ≤ 1.5 s after question; answer placed `right_of`/`below` user mark. |
| Partial | 2.7 | **Interactive: Q&A branches in session log; resume** | Lecture resumes exactly at pause point; branch collapsible. |
| Not started | 2.8 | Remotion export | Session log → 1080p30 MP4 with audio; with/without Q&A branches. |
| Partial | 2.9 | Share links + basic auth | A lecture URL plays for anyone with the link. |
| Partial | 2.10 | Licensing decision executed | Commercial keys for tldraw/Remotion, or MIT fallback swapped in. |
| Not met | **Gate** | User pauses, circles a term, asks "why?", agent writes a 20‑s answer beside it, lecture resumes; MP4 downloads. | |

### Phase 3 — Final (weeks 10–14) · "From a codebase, with checking, at quality"
| Status | # | Task | Done when |
|---|---|---|---|
| Not started | 3.1 | Codebase ingestion (tree‑sitter + summaries + ranking) | Repo URL → abstractions, data‑flow graph, key signatures. |
| Not started | 3.2 | Code‑lecture templates | Architecture diagram beat, "one request's journey" beat, key formula beat. |
| Not started | 3.3 | Mathpix / vision parse of user maths | "Is this right?" → step‑level verification, wrong step underlined. |
| Not started | 3.4 | SymPy verification hook | Agent checks its own and the user's algebra before writing. |
| Not started | 3.5 | Handwriting quality: CROHME fine‑tune | Maths strokes match prose hand; OCR recovery ≥ 98 %. |
| Not started | 3.6 | Personas | ≥ 2 voice + handwriting‑style pairs. |
| Not started | 3.7 | Remotion Lambda + queue | 10‑min lecture renders in < 2 min at scale. |
| Not started | 3.8 | Learning eval | 2‑arm study (dynamic ink vs static slides) on 20 topics, transfer questions. |
| Not started | 3.9 | Cost + latency dashboard | ≤ $0.40 / 10‑min lecture; p95 Q&A latency < 2 s. |
| Not started | 3.10 | Polish | Hand shadow overlay, paper texture (export only), erase animation, page turn. |
| Not met | **Gate** | Paste a GitHub URL → 8‑minute handwritten lecture with diagram + formula; pause, ask, get written answer; export MP4. | |

### Later
Multilingual (voice + handwriting models per language); multiplayer classroom; native iPad app with Apple Pencil; agent‑initiated questions to the learner (generative‑activity principle).

---

## 9. Evaluation

- **Learning:** 2‑arm test (dynamic ink vs. same content on static slides), transfer questions, following Fiorella & Mayer's design.
- **Sync quality:** median |ink‑end − word‑end| < 200 ms.
- **Legibility:** OCR (Mathpix) recovers ≥ 98 % of generated maths; human rating ≥ 4/5.
- **Pacing:** 2–3 chars/s prose; no beat > 90 s; recap every ≤ 6 min.
- **Cost:** ≤ $0.40 per 10‑min lecture (TTS dominates).

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Maths handwriting looks "font‑like" next to RNN prose | Jitter + shared pen model; later CROHME fine‑tune. |
| Agent produces text walls | Editor stage hard‑limits ink per beat; reject beats with no drawable op. |
| Ink/voice drift over long sessions | Re‑anchor on every beat boundary; never free‑run the clock. |
| Licensing cost (tldraw/Remotion) | MIT fallback path is defined; only display/export layers are affected. |
| Latency in interactive mode | Spoken acknowledgement + streamed chunks; pre‑generate likely follow‑ups. |
