# Learn cleanup (C0-C11)

Status (2026-09-29): C0 done; C1-C10 in progress on `feature/learn-cleanup`.
Not a Tutor Agent: no Socrates, Feynman, Plato, learner state or adaptive
routing. Every existing Learn request should have an understandable path,
the right context, an explicit model configuration, an accurate prompt and
predictable output and storage.

## Baseline

- Branch `feature/learn-cleanup`, baseline commit `feb4825` (local tag
  `learn-cleanup-baseline`).
- It is the frozen WP7 acceptance build `8fbc6fb` (tag `wp7-acceptance-build`,
  smart-home WP1-WP7 plus parallel-work up to `546763c`), merged cleanly
  with `feature/parallel-work` `caca1c2`: the chat sheet, one-block answers and
  `docs/learn-agent-canvas-architecture.md`.
- The WP7 build is not modified. It stays the regression baseline.
- `feat/canvas-block-conversations` (NC cards) is not in the baseline. It
  shares no merge base with WP7 after main `94dad46`. It touches `ask.jsx`
  (7 lines), `LearnPage.jsx` and `AdaptiveCanvas.jsx`, so that later merge
  must re-check them.
- Baseline unit tests: 1162/1162 node, 31/31 python.

The architecture doc describes `3bc489e`, before smart-home's work merged.
The main differences on the baseline:
- Standalone canvases (`canvas-<8 hex>`, `LEARN_DB canvases`) answer through
  `apiAsk` with the `canvasAskSeam`. Their threads live in `LEARN_DB`.
- Learn is mounted only for canvases and `repo-*` projects. Job/server apps
  no longer show it.
- The Mothership Agent Bar sends project asks to `repositoryAsk`.
- The repository page's Graph Agent panel is gone.

## Owner decisions (2026-09-29)

1. **Storage:** stop both production writes. Dev reads and writes of
   `learn_moments` use `LEARN_DB` (production `small-cp` has no `LEARN_DB`,
   so it is unchanged). Dev Keep/Dismiss and hot moments stay quiet until a
   `learn_moments` table exists in `small-learn-dev`, which is a separate go.
   The dev worker refuses Learn asks for job/server apps with a 403.
2. **Card context:** a new optional `canvas_target {id, kind, title, text}`
   field on the Learn ask. The card text is bounded separately, with an
   explicit truncation marker, and `message` stays the learner's words.
   Old wrapped messages are still accepted.
3. **Grading:** a new dev-only `POST /api/learn/assess`. The server builds
   today's instruction text unchanged, with the same default model and no
   tools, thread or app context. `/api/learn/grade` stays Jev-only.
4. **Cards and whiteboard model:** OpenAI is used only when
   `LEARN_PLAN_MODEL` is set explicitly. With no var, every environment,
   shared dev included, uses `claude-opus-5`.

## Classification

Produced by 16 read-only audits, each checked by an independent verifier,
against the baseline.

### Findings (182)

| Id | Status on baseline | Change type | Finding |
|---|---|---|---|
| delta-1 | branch specific | record only | Baseline map: every UI entry into a Learn model call, with endpoint, handler, authorization and storage (and corrections to the three canvas kinds) |
| delta-2 | branch specific | docs or tests only | Doc sections 1, 2, 4.2, 4.4, 7 and 14 describe two Learn chat paths; the baseline has a third (standalone canvas through apiAsk with the LEARN_DB seam) |
| delta-3 | still present | behavior bug fix (decision) | canvasAskSeam covers thread storage and the askStream moment insert only: research tools use the unswapped env, @mentions read production app context, and moment feedback on a canvas still writes the production D1 |
| delta-4 | still present | behavior bug fix (decision) | Repository Learn asks (repo-* Learn canvas and the new Agent Bar project asks) still write the video-moment log to the production D1 |
| delta-5 | still present | contract change (decision) | Job/server Learn: the preview no longer mounts it, but the dev worker still serves /api/learn/ask for those apps and writes threads and messages to the production D1 |
| delta-6 | still present | docs or tests only | The D7 preview write guard is browser-only, skips fetch() callers and allowlists dev-worker routes that still write the production D1 |
| delta-7 | branch specific | behavior bug fix (decision) | Canvas attachments: the server refuses them, the canvas composer still offers them, and the refusal's rationale went stale in the merge |
| delta-8 | still present | behavior bug fix (decision) | The canvas composer offers app-only context controls: the Sources toggles do nothing and @mentions mix production app context with silently dropped canvases |
| delta-9 | still present | contract change (decision) | The Mothership Agent Bar is a new, undocumented entry into repositoryAsk, and that handler's prompt and tools describe canvas side effects the bar cannot show |
| delta-10 | branch specific | docs or tests only | The repository page Graph Agent panel was removed, so e2e/learn-chat-one-block.mjs and doc section 16 point at a surface that no longer exists |
| delta-11 | still present | contract change (decision) | New thread lists on the baseline (Project Overview 'Recent activity', Agent Bar History) show Learn grading and card threads under their instruction text; canvases get the same thread titles |
| delta-12 | already fixed | docs or tests only | Repository snapshots moved out of the production R2 bucket; doc section 14 omits the new binding, the canvases table and the new browser keys |
| delta-13 | still present | behavior bug fix (decision) | wrangler.parallel.jsonc lacks REPOSITORY_SNAPSHOTS, so every repository ask fails on a clone deployed from it; the two clone deploy recipes disagree; snapshots imported before the move may be unreadable |
| delta-14 | branch specific | docs or tests only | a3cda90 changed REPOSITORY_SYSTEM; the doc's verbatim prompt is stale and the change must be carried through C3 |
| delta-15 | needs reproduction | pure refactor | live-bundle-check.mjs keeps Rabbit Hole shell code out of the live build but does not cover Learn canvas code, which an unconditional lazy import still emits |
| delta-16 | branch specific | record only | The Learn handoff is merged but switched off: /teach, Start -> Question and the Map's 'Learn this' fall back without a model call |
| delta-17 | already fixed | docs or tests only | Doc section 15 'hi carries the whole appContext' no longer happens through the preview UI; only @mentions and the unmounted job/server server path remain |
| delta-18 | still present | docs or tests only | 'No router' still holds for Learn, but the baseline adds a deterministic command router in front of the Agent Bar |
| prompts-1 | still present | behavior bug fix | Chat prompt still advertises the removed 'Explain on canvas' button and canvas operations on every Learn chat route |
| prompts-2 | still present | behavior bug fix | Whiteboard draft prompt says video and 3D scenes are generated after review, but the only caller renders them as 'not generated' placeholders |
| prompts-3 | still present | behavior bug fix | Chat prompt describes a lesson snapshot and a displayed canvas that no canvas route sends |
| prompts-4 | still present | behavior bug fix | Chat identity hard-codes the provider: 'You are Claude' |
| prompts-5 | still present | behavior bug fix | No greeting or small-talk rule in any Learn chat prompt |
| prompts-6 | still present | behavior bug fix | Blanket notation rule in the shared teaching policy forbids defining unfamiliar symbols and contradicts the policy's own example |
| prompts-7 | still present | behavior bug fix | Hot video candidates are presented to the model as trusted rather than as a previously accepted window |
| prompts-8 | still present | behavior bug fix | Outline editing is mentioned on routes that never supply propose_lesson_outline |
| prompts-9 | still present | behavior bug fix | Learn attachment note tells the model a run tool can use the upload, but Learn never supplies one |
| prompts-10 | still present | behavior bug fix | Inline context lines mislabel group snapshots and are missing on the repository route for paper regions and images |
| prompts-11 | still present | behavior bug fix | Video tool text and tool-result notes say the learner sees the clip playing; it arrives after the answer, cued, not playing |
| prompts-12 | still present | docs or tests only | Grading is assembled as a chat message under the tutor prompt and tools, so every C3 chat-prompt edit also changes the grader |
| prompts-13 | not a problem | record only | Jev gradeQuestions: pinned protocol that already separates the learner's answer from instructions |
| prompts-14 | still present | pure refactor | Learn prompts live outside the src/agents/ convention; give them a prompt-only home with compatibility exports |
| prompts-15 | still present | behavior bug fix | Advertised versus supplied capabilities per route: remaining mismatches (video provider, 'deployed app', minor tool text) |
| prompts-16 | not a problem | none | The Mothership Agent Bar composes no Learn prompt text |
| prompts-17 | needs reproduction | docs or tests only | Client prompt modules versus the production browser bundle: grading prompt now gated, but the boundary is not checked for prompt text and one Learn canvas path is unguarded |
| prompts-18 | still present | docs or tests only | Architecture doc prompt sections have drifted from the baseline |
| prompts-19 | not a problem | docs or tests only | Evidence safeguards to preserve through every prompt edit (inventory) |
| prompts-20 | still present | docs or tests only | No test checks the assembled per-route prompt or tool list at the model boundary |
| prompts-21 | branch specific | behavior bug fix | Tool-result notes tell the model the learner sees a paper, article or video, but Agent Bar asks drop the paper and show the others only as source links |
| models-1 | still present | record only | Effective model per Learn task and environment on the baseline (characterization matrix) |
| models-2 | still present | behavior bug fix (decision) | OPENAI_API_KEY on its own switches slash-command cards and the whiteboard (plan, draft and review) from claude-opus-5 to gpt-4.1-mini |
| models-3 | still present | behavior bug fix (decision) | SUBSCRIPTION_ONLY is bypassed by planModel: with an OpenAI key, cards and whiteboard generation and review go to paid OpenAI |
| models-4 | still present | behavior bug fix | The subscription owner gate misses repository asks and repository course authoring, so any member could spend the owner's personal subscription |
| models-5 | still present | behavior bug fix (decision) | The chat model picker does not say that its choice reaches only chat answers |
| models-6 | branch specific | behavior bug fix (decision) | Agent Bar Learn asks always run Auto and ignore the Settings default model |
| models-7 | still present | contract change (decision) | The whiteboard server still accepts a `model` request field that no client sends |
| models-8 | still present | behavior bug fix | The model allowlist lookup accepts Object.prototype keys and then sends a request with no model |
| models-9 | still present | record only | Refusal-fallback policy is implicit and differs by task for the same model id |
| models-10 | still present | record only | Thinking and effort are implicit model defaults that share tight max_tokens budgets |
| models-11 | still present | behavior bug fix | No sanitized model diagnostics on any Learn path: task, provider, served model, config source, prompt version and fallback use are all unrecorded |
| models-12 | still present | pure refactor | Model resolution, provider dispatch and error handling are duplicated across the four paths (C2) |
| models-13 | still present | pure refactor | Picker metadata is written out three times with no shared list or test |
| models-14 | still present | record only | Per-org AI settings (org_ai) never apply to Learn chat, grading, cards or the whiteboard; course authoring does apply them |
| models-15 | still present | pure refactor | Limits are literals spread over about twelve files with no shared tested configuration, and several model calls have no timeout |
| models-16 | still present | docs or tests only | A stale Jev transport comment, and three transport defaults in two files |
| models-17 | still present | docs or tests only | Architecture doc model statements need corrections (sections 9, 10.3, 15 and 17.4) |
| models-18 | still present | behavior bug fix | On the OpenAI plan path, Pexels photos become an invalid data URL in whiteboard review and revision, and inspect_image results reach the model as JSON text |
| context-1 | still present | contract change (decision) | Ask in chat (K4) puts unbounded card text into `message`; validated cards exceed the 4000-character limit |
| context-2 | still present | behavior bug fix | Group Ask (K5) caps the members' text at 4000 before wrapping, so a capped group always exceeds the message limit; truncation is silent |
| context-3 | still present | behavior bug fix | Group Ask screenshot (K5 image_context) sticks to every later question, outranks wiki/video, can miss its own question, and is invisible |
| context-4 | still present | behavior bug fix (decision) | Single-source precedence is invisible and sticky: a dropped image outranks later cards, attached sources ride with card asks, and Files says 'Tutor reads' for every source |
| context-5 | still present | behavior bug fix (decision) | Repository path silently drops outline, wiki_context and video_context (not validated, not used, no unsupported state) |
| context-6 | still present | behavior bug fix | Repository path cannot read an uploaded PDF; after an upload every question on a repository canvas fails until the paper chip is cleared |
| context-7 | still present | behavior bug fix | Composer + attachments (K3) differ by canvas kind without saying so: repository apps refuse anything over ~64 KB, standalone canvases refuse after send |
| context-8 | needs reproduction | behavior bug fix | Paper-region questions (K7) on repository apps may hit the same 64 KB cap, because the preview PNG rides inside the JSON body |
| context-9 | still present | behavior bug fix | Whiteboard region (K6) shows the region picture in the composer chip, but only shape types and text reach the model |
| context-10 | still present | contract change (decision) | Continue convo (K8) seeds only the raw question and answer; the linked card the answer was about is lost |
| context-11 | still present | behavior bug fix | @mentions (K9): unresolved mentions are dropped silently, canvases are offered but never resolvable, and mentioned app context has no combined budget |
| context-12 | still present | behavior bug fix (decision) | A plain ask or greeting (K1) on a project-owned canvas carries the whole appContext; code questions rely on the bundle because the non-repository Learn chat has no code retrieval tool |
| context-13 | still present | behavior bug fix (decision) | The deployed source is dropped whole and silently when appContext would exceed 600k characters |
| context-14 | still present | behavior bug fix | Sources toggles: switching all off sends [] which the server reads as 'everything'; the toggles cannot remove the source or members; they do nothing on standalone canvases |
| context-15 | still present | behavior bug fix | Learn questions with a + attachment are told about a 'run tool' that the Learn route never supplies |
| context-16 | still present | behavior bug fix (decision) | Switching the repository off in Files does not stop repository context or tools, although Files says the tutor ignores it |
| context-17 | still present | behavior bug fix | Ask about a YouTube moment card sends 'Source: undefined' and drops the video id and window |
| context-18 | not a problem | record only | Standalone canvas chat context (canvasAskSeam) is one fixed line by design; mentions still read the live DB |
| context-19 | still present | pure refactor | Learn context validation and source building are duplicated between apiAsk and repositoryAsk and have diverged (C2) |
| context-20 | still present | behavior bug fix | Grading (K10) embeds the learner's answer in `message`; long answers exceed 4000 and the card shows a misleading 'Could not reach the tutor' (owned by C6) |
| context-21 | still present | docs or tests only | The architecture doc's context sections (4.4, 5, 6.1, 7, 15) are inaccurate or incomplete on the baseline |
| context-22 | still present | behavior bug fix | Group Ask composer chip shows the literal text 'undefined' as the card title |
| grading-1 | still present | contract change (decision) | Opus grading runs as a full Learn chat turn: it gets the Learn system prompt, the research tools, up to 9 model calls and the chat context |
| grading-2 | still present | behavior bug fix (decision) | Where a grade is stored on each canvas kind: the dev handlers can still write the Opus grade or a moment row to production storage |
| grading-3 | still present | behavior bug fix (decision) | Every grade creates a new chat thread: sheet History gets crowded out, the canvas can no longer be deleted, threads are titled with the instruction, and a storage failure erases a verdict already shown |
| grading-4 | still present | behavior bug fix | A long answer cannot be graded, because the instruction and the learner's answer share the 4000-character cap on chat messages |
| grading-5 | still present | pure refactor | Grading instructions and VERDICT parsing are not in one canonical module: the parse exists in three copies, and the prompt test does not pin the text |
| grading-6 | not a problem | record only (decision) | Fingerprints and the holdout: moving the prompts or changing the Opus call burns nothing, but it still shifts the Opus comparator |
| grading-7 | not a problem | record only | The existing /api/learn/grade contract (Jev shadow): its callers, request and response. It already stays within the dev storage boundary. |
| grading-8 | still present | behavior bug fix | A grade can end in a permanent 'Reading your answer…' or end silently with no verdict |
| grading-9 | still present | behavior bug fix | Clicking Answer again during a grade lets the old attempt's verdict land in the new attempt |
| grading-10 | still present | behavior bug fix | The benchmark's Opus arm stores every case, holdout cases included, as a chat thread, and nothing stops it from targeting a normal app on the production DB |
| grading-11 | still present | contract change (decision) | The grading instruction is built in the browser and the learner's answer is pasted into it; the Opus side has no guard that treats the answer as data |
| grading-12 | still present | pure refactor | The grader's model configuration is implicit: default Opus 5 with server-side fallback, the picker and org AI settings are ignored, and the serving model is not recorded |
| grading-13 | still present | docs or tests only | The architecture doc and the Jev doc are stale or inaccurate about grading on the baseline |
| grading-14 | already fixed | none | AWS-hosted apps: grading could not follow the app's chat route, but the baseline no longer mounts Learn for those apps |
| grading-15 | still present | behavior bug fix | Grade threads appear in the Agent Bar History on a project page, titled with the grading instruction, and opening one makes it the bar's current conversation |
| registries-1 | still present | behavior bug fix | Artifact generator offers and proposes provider-backed primitives without checking the provider is configured |
| registries-2 | still present | contract change (decision) | Browser surfaces show every keyed or paid tool as usable, failure comes only at use time, and the palette's dev tier is always on |
| registries-3 | still present | pure refactor | The primitive -> block.type -> palette -> slash -> paid -> provider mapping is only implicit; code_exercise->code and narration->audio are not encoded anywhere |
| registries-4 | still present | docs or tests only | No unit test cross-checks palette ids, BLOCK_TYPES, CARD_OF and renderer dispatch against PRIMITIVES; the palette test only checks itself |
| registries-5 | still present | behavior bug fix (decision) | The canvas sizes cards by block.type, but the Slash commands sheet sizes them by palette id while claiming to match the canvas |
| registries-6 | still present | pure refactor | The / picker treats a command as available because of a direct primitive the command cannot insert (/video) |
| registries-7 | not a problem | none | The /api/learn/artifact boundary is intact on the baseline: tools derived on the server, schema and semantic checks, one repair, explicit results |
| registries-8 | not a problem | none | No code marks a generator ready because a renderer or Insert-palette sample() exists |
| registries-9 | still present | record only | The whiteboard explainer has its own generator vocabulary; its video and scene kinds are generated and validated but cannot run on the only mounted renderer |
| registries-10 | still present | record only (decision) | Speech-to-text is an OpenAI provider call that sits outside the paid registry and has no paid gate |
| registries-11 | still present | behavior bug fix (decision) | /source is offered in the Learn picker, but no canvas wires its handler |
| registries-12 | still present | docs or tests only | The architecture and feature docs misstate parts of the registries |
| registries-13 | needs reproduction | none | Which providers are configured on each dev worker cannot be verified from code |
| registries-14 | still present | behavior bug fix | The whiteboard explainer offers Desmos graphs without checking DESMOS_API_KEY, unlike its Pexels tools |
| lifecycle-1 | still present | behavior bug fix | Stop and interrupted answers have no end state: the sheet spins forever, a linked card reads 'done…' and cannot continue, and replies restored after a reload or a server pull stay 'Thinking…' |
| lifecycle-2 | still present | behavior bug fix | A non-JSON error page, or a stream that ends without done/error, fails silently in the Learn chat and grading consumers |
| lifecycle-3 | branch specific | behavior bug fix | Mothership: a stream that closes without done or error leaves the turn open forever, with a spinner (or no end state) and History and New chat disabled |
| lifecycle-4 | needs reproduction | behavior bug fix | Stop, client timeouts and navigation never reach server model or tool work; the loop stops only if the platform cancels the response stream, and a reason-less cancel crashes the error handler |
| lifecycle-5 | still present | behavior bug fix (decision) | No deadline on Learn model calls or on the slash, grading and Continue convo requests, and only the dock has Stop |
| lifecycle-6 | still present | behavior bug fix | A second slash command while one runs is swallowed with no message, and a clarification then overwrites what was typed |
| lifecycle-7 | still present | behavior bug fix | Grading: a late verdict from an earlier attempt lands in the next attempt, a reload mid-grade shows 'Reading your answer…' forever, and an error after a streamed verdict replaces it |
| lifecycle-8 | still present | behavior bug fix (decision) | Continue convo replies (and grading) receive paper, wiki and video events with no handler, while the model is told the learner now sees the card |
| lifecycle-9 | still present | behavior bug fix (decision) | An outline proposal from the dock lands in the right panel, which is closed by default and not mounted at all on narrow screens |
| lifecycle-10 | still present | behavior bug fix | The side-panel Learn chat navigates the learner out of Learn to the Map whenever a repository answer carries a graph |
| lifecycle-11 | still present | behavior bug fix | An error that arrives after the answer chunk is glued onto the answer text in the sheet and card |
| lifecycle-12 | still present | contract change (decision) | The thread id arrives only with done, so a stopped or failed first question leaves a thread and a user message the browser never learns about |
| lifecycle-13 | still present | pure refactor | Request and loop limits are inline literals across about ten files; the research-step, artifact-repair and whiteboard-review limits are already separate and must stay separate |
| lifecycle-14 | still present | behavior bug fix (decision) | Attachment and message limits differ by route: repository asks cap the whole request at 64 KB, canvases refuse attachments, apiAsk allows 4 MB, and the Learn composer has no length cap |
| lifecycle-15 | still present | docs or tests only | SSE audit, every Learn event by producer and surface (rendered, metadata or unsupported); the dock's graph is stored-only by design and doc §6.2 needs a per-surface column |
| lifecycle-16 | not a problem | none | Late answers cannot land in another canvas or another sheet thread; two edge cases remain unverified |
| lifecycle-17 | not a problem | none | The artifact repair loop and the whiteboard review loop end in explicit states and match the doc's limits |
| lifecycle-18 | not a problem | record only | What 'no token streaming' means today: every Learn surface gets progress labels, then the whole answer as one chunk |
| paid-persist-1 | not a problem | none | paidRefusal checks only `confirmed === true`, runs at every paid generation handler before the provider call, and every client sender is behind PaidConfirm |
| paid-persist-2 | still present | behavior bug fix | A `confirmedStart` flag stored in block data starts a paid job on mount with no Generate press, including from a shared view or a fork of a crafted board |
| paid-persist-3 | still present | record only (decision) | Image and TTS paid routes check authorization only; nothing limits repeats or duplicates |
| paid-persist-4 | still present | record only (decision) | /api/learn/transcribe calls a paid OpenAI model with no paidRefusal and no confirmation; learn-paid.js says every provider must be gated |
| paid-persist-5 | still present | record only (decision) | 'One job at a time' holds per learner per app Durable Object, not per learner, and standalone canvases are uncapped |
| paid-persist-6 | still present | behavior bug fix | A busy Manim worker (429, nothing started) is recorded as an 'uncertain' submission, so that animation can never be retried in that app |
| paid-persist-7 | still present | docs or tests only | LearnScenes re-sends /jobs to the Blender worker with no new learner action (bounded; the docs do not say so) |
| paid-persist-8 | still present | behavior bug fix | A paid card saved mid-job never resumes after reload, share or fork: permanent progress bar with no Generate or Retry |
| paid-persist-9 | still present | behavior bug fix | Sheet History ids are stored under `small.learn-sheet-threads:<app>` with no org or email scope; scope the key and adopt legacy ids only after the server confirms them |
| paid-persist-10 | not a problem | none | The server rejects reading or continuing another user's thread ids on all three Learn paths |
| paid-persist-11 | still present | record only (decision) | Sheet History only sees the 20 newest Learn threads, and card asks and grading each create one, so older sheet chats silently drop out |
| paid-persist-12 | still present | docs or tests only | Inventory of Learn and canvas browser keys, and which are scoped by org and email; architecture section 14 is incomplete |
| paid-persist-13 | still present | behavior bug fix (decision) | A ?board= review board writes attached sources into the main canvas's sources key |
| paid-persist-14 | needs reproduction | behavior bug fix | Image, TTS and transcribe routes have no Origin check, so a same-site page (any *.zeroshothq.workers.dev host) can plausibly spend a signed-in learner's paid calls |
| inert-1 | still present | record only (decision) | LearnPage `editor` is never set, so every editor-gated lesson-player path in LearnPage is unreachable. It is parked on purpose, not dead by accident. |
| inert-2 | still present | pure refactor | boardContext.snapshot/isCurrent and ask.jsx's /api/learn/selection and lesson_snapshot branch have no reachable producer |
| inert-3 | still present | pure refactor | boardContext.label/clear and the 'Asking about: {label}' chip can never render |
| inert-4 | still present | docs or tests only | boardContext.preview is half live: paper-region previews from the right-panel reader work and reach the model; only the canvas half is dead. The doc says preview 'does nothing'. |
| inert-5 | still present | behavior bug fix | The right-panel 'Learn Agent' chat receives the dead demo: it shows a permanently disabled 'Explain the sigmoid function · Demo' pill and silently drops that exact question |
| inert-6 | still present | docs or tests only | The second boardContext consumer is undocumented: the right-panel 'Learn Agent' AskPanel in the My notes view is a non-sheet Learn chat |
| inert-7 | needs reproduction | behavior bug fix | LearnNotes 'Return to lesson' and 'Save & resume' call editor-dependent code and throw when the editor is null |
| inert-8 | still present | pure refactor | Leftovers of the removed Explain on canvas (490c171): boardVisible, explanation, boardRequest, the 'Save to notes / Resume lesson' strip, and addNote |
| inert-9 | still present | pure refactor | Several tldraw-era identifiers in LearnPage have zero references, even from parked code |
| inert-10 | not a problem | none | The /api/learn/selection route, the lesson_snapshot server contract and validateLessonSnapshot should stay: the contract is retained and tested, and the validator is live |
| inert-11 | still present | docs or tests only | e2e/canvas-conversations-check.mjs asserts pre-sheet behavior and card chrome that no longer exists |
| inert-12 | still present | docs or tests only (decision) | e2e/learn-preview.spec.js fails on the baseline before its first click, and all 11 of its tests drive UI with no entry point |
| inert-13 | still present | docs or tests only (decision) | e2e/coaching.preview.js has eight Learn tests that assert the tldraw lesson and /api/learn/selection snapshot payloads |
| inert-14 | still present | docs or tests only | e2e/chat-block-check.mjs expects a plain dock ask to create the movable chat card that its later checks depend on |
| inert-15 | still present | record only (decision) | e2e/nanogpt-canvas-shots.mjs drives the parked lesson timeline and the removed tldraw lesson canvas |
| inert-16 | still present | docs or tests only | docs/features/canvas-sharing.md says board files are stored in small-runs, but they go to LEARN_MEDIA (small-learn-media-dev) |
| inert-17 | still present | docs or tests only | docs/features/coaching.md describes the tldraw selection flow and a stale check as if they were current |
| inert-18 | still present | docs or tests only | Section 15 and rows 4.1 #6/#8 of the architecture doc misstate the inert plumbing and understate the stale checks |
| inert-19 | still present | behavior bug fix (decision) | My notes is a one-way door: the notes view has no control back to the canvas, and on canvases it is always empty |
| duplication-1 | still present | behavior bug fix | paper_context validation and loading duplicated in apiAsk and repositoryAsk; the repository copy rejects uploaded PDFs |
| duplication-2 | still present | behavior bug fix | Repository asks cap the whole request at 64 KB, so the composer's 4 MB attachments fail on repository canvases |
| duplication-3 | still present | pure refactor | Video-moment tool runner, tool list and VIDEO_SYSTEM pairing copied between apiAsk and repositoryAsk |
| duplication-4 | still present | pure refactor | Model resolution written at four sites with three different Auto policies |
| duplication-5 | still present | behavior bug fix | ASK_MODELS[key] accepts prototype keys (constructor, toString, __proto__) and sends a non-string model |
| duplication-6 | still present | pure refactor | Chat system prompt is assembled in three layers, and differently per handler |
| duplication-7 | still present | pure refactor | Model-call failure handling and tool-call extraction copied across researchAnswer, generateBoardPlan and generateArtifact |
| duplication-8 | still present | pure refactor | arXiv search/read execution and the two-paper cap duplicated between researchAnswer and the whiteboard draft loop |
| duplication-9 | still present | pure refactor | Thread storage and the 10-turn history window re-implemented in apiAsk, repositoryAsk and canvasAskSeam |
| duplication-10 | still present | pure refactor | Request limits repeated as literals and inconsistent across the four paths |
| duplication-11 | still present | pure refactor | SSE framing: two server producers and four browser parsers |
| duplication-12 | still present | pure refactor | Grading verdict parsing duplicated between parseVerdict and ChallengeBody |
| duplication-13 | still present | pure refactor | Four base64 encoders for model content blocks |
| duplication-14 | still present | pure refactor | apiAsk re-implements readAskRequest's JSON/multipart branch and the 4 MB check |
| duplication-15 | still present | pure refactor | Dev-only subscription owner gate pasted three times; artifact and board requests are authorized twice when it is on |
| duplication-16 | still present | record only | Same-origin POST guard copied into eight handlers but missing on chat, whiteboard, upload and paid dev routes |
| duplication-17 | still present | behavior bug fix | Chat 'Papers read' footer labels an uploaded PDF as arXiv with a null link |
| duplication-18 | still present | record only | Untrusted-evidence rule restated in about 15 prompt strings; the Opus grading prompt lacks the guard Jev's protocol has |
| duplication-19 | not a problem | none | The one-repair loops in the artifact maker and the whiteboard look alike but are different contracts; do not merge |
| duplication-20 | not a problem | none | agents/loop.js is not used by Learn and should not be |
| duplication-21 | not a problem | none | The no-store JSON response helper is redefined in six Learn modules |
| duplication-22 | still present | record only | A project-canvas ask is authorized twice: through the service binding, then directly against DB |
| duplication-23 | still present | behavior bug fix | apiAsk's attachment copy stashes Learn attachments in ask-uploads and tells the model about a run tool Learn never supplies; repositoryAsk's copy does neither |

### Storage traces (C1, before fixes)

| Operation | Canvas kind | Production write | Production targets |
|---|---|---|---|
| T1-plain-ask | standalone canvas | no | CONTROL_PLANE -> live small-cp env.DB.runs |
| T1-plain-ask | project app canvas | yes | DB.threads, DB.messages, DB.learn_moments, CONTROL_PLANE -> live small-cp DB.threads, CONTROL_PLANE -> live small-cp DB.threads, messages, proposals, CONTROL_PLANE -> live small-cp DB.threads, messages, learn_moments |
| T1-plain-ask | repository app | yes | DB.learn_moments, CONTROL_PLANE -> live small-cp DB.runs |
| T1-plain-ask | mothership or other | yes | DB.learn_moments, CONTROL_PLANE -> live small-cp DB.runs |
| T2-ask-in-chat | standalone canvas | no | - |
| T2-ask-in-chat | project app canvas | yes | DB.threads, DB.messages, DB.learn_moments |
| T2-ask-in-chat | repository app | yes | DB.learn_moments |
| T2-ask-in-chat | mothership or other | n/a | - |
| T3-continue-convo | standalone canvas | no | - |
| T3-continue-convo | project app canvas | yes | DB.threads, DB.messages, DB.learn_moments |
| T3-continue-convo | repository app | yes | DB.learn_moments |
| T3-continue-convo | mothership or other | n/a | - |
| T4-grading | standalone canvas | no | - |
| T4-grading | project app canvas | no | - |
| T4-grading | repository app | yes | DB.learn_moments |
| T4-grading | mothership or other | yes | DB.threads, DB.messages, DB.learn_moments |
| T5-moments | standalone canvas | yes | DB.learn_moments |
| T5-moments | project app canvas | yes | DB.learn_moments, DB.threads, messages |
| T5-moments | repository app | yes | DB.learn_moments |
| T5-moments | mothership or other | no | - |
| T6-boards-media | standalone canvas | yes | DB on production small-cp, reached through CONTROL_PLANE GET /api/apps.runs |
| T6-boards-media | project app canvas | no | - |
| T6-boards-media | repository app | yes | DB on production small-cp, reached through CONTROL_PLANE GET /api/apps.runs |
| T6-boards-media | mothership or other | yes | DB on production small-cp, reached through CONTROL_PLANE GET /api/apps.runs |
| T6-boards-media | mothership or other | yes | DB on production small-cp, reached through CONTROL_PLANE GET /api/apps.runs |
| T6-boards-media | mothership or other | yes | DB on production small-cp, reached through CONTROL_PLANE GET /api/apps.runs, RUNS (on the production worker, reached through the CONTROL_PLANE proxy) ask-uploads/<u-id>/ (multipart /api/ask); runs/<id>/inputs/ (approve -> startRun) |

### C1 storage result

Kinds: standalone canvas (`canvas-<8 hex>`, `project` null), project-owned
canvas (`canvas-<8 hex>` with `project = repo-*`, same seam), repository app
(`repo-*`, also the Agent Bar's project asks), live job/server app (no UI
since D7; crafted request only). "Live" means the production D1 `small`,
bucket `small-runs` or worker `small-cp`. Every proof test binds a live DB
and bucket that record each call (`control-plane/test/live-storage-spy.js`)
and asserts the record is empty. A fake that only throws proves nothing,
because the moment log and the hot path swallow errors.

| Operation | Kind | Before (baseline) | After (C1) | Proof test |
|---|---|---|---|---|
| Ask, selection, Continue convo, tutor grade (`apiAsk`) | standalone and project-owned canvas | threads and messages in `LEARN_DB`; moment log to `LEARN_DB` by the seam; hot path read live `learn_moments` on clones with AI and MOMENTS | threads unchanged; moment log and hot path through `learnMomentsDb` = `LEARN_DB`; no live read or write | `learn-chat.test.js` "canvas Learn asks keep their threads in LEARN_DB..." and "a canvas video answer with the real moment code never reads or writes the live DB" (RED with the old hot path) |
| Same asks (`repositoryAsk`) | repository app | threads in `LEARN_DB`; `INSERT INTO learn_moments` on the live DB; hot path read live | all in `LEARN_DB`; the dev moment log is quiet (no table) and the video still streams, without `momentId` | `repositories.test.js` "a repository video answer writes no learn_moments row to the live DB" (RED: the insert was recorded) |
| `/api/learn/ask`, `/api/learn/selection` | live job/server app | `apiAsk` without a seam: live threads, messages, `learn_moments` | JSON 403 right after `authorizedBoardApp`: "Learn on a live app is off on this preview: it would write live chat history." | `canvases.test.js` "the dev worker refuses Learn asks for live apps and ends every Learn ask on itself" (helper plus call-site pin) |
| Learn ask POST that is neither JSON nor multipart | any | proxied to live `small-cp` `apiAsk` | 415 on the dev worker | same test (source pin: the 415 comes before body parsing) |
| Multipart Learn ask (+ attachment) through `apiAsk` | live app (now refused on dev), production `small-cp` | `ask-uploads/<id>/<name>` put into `learnMedia` (dev bucket on dev, `small-runs` on production), never read | no put for Learn; Agent `/api/ask` keeps it; canvases still refuse multipart (400) | `learn-chat.test.js` "a Learn attachment reaches the model as a block, with no ask-uploads copy and no run-tool note" (RED: note present) |
| Keep/Dismiss (`/api/learn/moment-feedback`) | every kind | `UPDATE` and `SELECT learn_moments` on the live DB | `LEARN_DB`; answers 400 until `small-learn-dev` has the table (the card ignores it) | `learn-moment-feedback.test.js` "dev Keep/Dismiss never touches the live DB, whatever the app kind" (RED: live UPDATE) |
| Hot path read | every kind, clone with AI and MOMENTS | live `learn_moments` | `LEARN_DB` | `learn-moment-index.test.js` "the hot path reads learn_moments from LEARN_DB when it is bound" (RED) |
| Jev grade, baseline, bench, report | live app, repository, canvas | `LEARN_DB learn_grades` | unchanged | `learn-grade-routes.test.js` "Jev grade, baseline, bench and report never touch production storage..." |
| Board save, share, files, fork | live app, repository, canvas | `LEARN_DB learn_boards`, `LEARN_MEDIA` | unchanged | `learn-boards.test.js` (every test runs with live spies; the bucket is bound as `LEARN_MEDIA`) |
| Media uploads | live app, repository, canvas | `LEARN_MEDIA` | unchanged | `learn-media.test.js` "media uploads and reads ... stay off production storage" |
| Generated clips and scenes | any | `LEARN_MEDIA` under `learn-video-dev/`, `learn-scene-dev/` | unchanged | `learn-video.test.js`, `learn-scene.test.js` (bucket bound as `LEARN_MEDIA`, live RUNS recorded empty) |
| Repository snapshots on a clone from `wrangler.parallel.jsonc` | repository | binding missing: every repository ask 400 | `REPOSITORY_SNAPSHOTS` = `small-repositories-dev` | `repositories.test.js` "dev repository snapshots cannot reach the production bucket" (every `dev-worker.js` config; RED on parallel) |
| Production `small-cp` | job/server app | moment log, Keep/Dismiss, hot path on `DB` | unchanged: no `LEARN_DB` binding, so `learnMomentsDb` falls back to `DB` | `learn-storage.test.js` "the moment log uses LEARN_DB where bound; production binds no LEARN_DB and keeps DB" |

Still live, by design or pending a decision (see Recorded, not changed):
identity reads through live `GET /api/apps` (and its `sweepStaleRuns`
UPDATE), `@mention` reads of live apps in `apiAsk`, and the Agent Bar's app
and workspace `/api/ask`, which the browser guard keeps off on the preview.

## Prompt changes

| File | Old text | New text | Reason |
|---|---|---|---|
| `packages/control-plane/src/index.js` `apiAsk`, Learn conversation with a + attachment | The question began with `(pending chat attachment: <name> (upload id u-<hex>) - the run tool can use it for a file-type input via attachment_id + attachment_input) ` | Nothing: the question is the learner's message. Agent asks (`/api/ask`) keep the note unchanged. | Learn is never offered the run tool, so the note claimed a capability the model does not have (prompts-9, context-15, duplication-23). |
| `packages/control-plane/src/agents/learn-chat.js` `LEARN_SYSTEM` (every chat route, and grading through it) | `Canvas operations are available after the learner chooses Explain on canvas.`; the two lines `Explain on canvas can now create technical 3D GLB assets ...` and `Explain on canvas also supports interactive_3d ...` (their last sentence, `Camera and animation state in selected threeD context are current learner state.`, stays); `The Explain on canvas pipeline can create an editable mathematical graph ...; do not output executable graph code.`; `The learner can choose Explain on canvas after your answer: that separate pipeline can draw and request a short AI-generated video ... Equations, code and precise diagrams use structured drawings instead.` | Removed, and in the last place: `You also cannot create cards or generate images, video, animation or 3D scenes; do not claim or offer that you did or will.` | The Explain on canvas button under answers was removed in `490c171`; chat has no canvas or generation tools (prompts-1). The whiteboard's own Explain in canvas is described only in the whiteboard prompts. |
| `agents/learn-chat.js` `LEARN_SYSTEM`, now `LEARN_SNAPSHOT_SYSTEM` for a request with a `lesson_snapshot` (`apiAsk`, `repositoryAsk`) | Every chat request was told: `Use the supplied semantic snapshot, page explanation, and related objects to explain the lesson.`, `Camera and animation state in selected threeD context are current learner state.`, the `Canvas page bounds ...` line and the `When target is null ...` line | Those four sentences, unchanged, go only to a request that sends a `lesson_snapshot` (`LEARN_SNAPSHOT_SYSTEM`). Every other request gets: `You see only what this request supplies: the learner's message; when they ask about a card, a group of cards or a marked region, that target's text quoted in the message, which can include the learner's own answers and the tutor's verdicts on those cards; an attached image when one is sent (a dropped picture or a rendered snapshot of selected cards); the lesson's section headings when supplied; the paper, article or video the learner has open when one is attached; and the scope context. You do not see the rest of the canvas, cards outside the target, notebook file contents, or the learner's grades beyond what a quoted card shows.` | No canvas route sends a snapshot (the tldraw editor is parked, inert-1), so the prompt described context the model never had (prompts-3). The untrusted-data, app-lesson and assistant-object sentences stay on every route (prompts-19). |

## Recorded, not changed

- **T6 F7/F8, sweep side effect.** Every identity read through live
  `GET /api/apps` (canvases, repositories, boards, feedback, the dev app
  list) runs `sweepStaleRuns`, an UPDATE on live `runs`. It is production
  housekeeping, not Learn data; changing it is a production-side decision.
- **delta-13, legacy snapshots.** `repository_versions` rows written before
  `1f21d70` may point at objects in `small-runs`, and a Refresh at the same
  commit reuses the row. Not verifiable without remote reads; nothing was
  copied or deleted.
- **delta-13, clone recipe.** CLAUDE.md and `parallel-dev-deploys.md` deploy
  clones with `wrangler.dev.jsonc --name` (no AI, MOMENTS or queue); the
  flywheel and architecture docs use `wrangler.parallel.jsonc`. Both now bind
  `REPOSITORY_SNAPSHOTS`. Which one is the recipe is an owner decision.
- **delta-3, mentions.** `apiAsk` still reads live apps for `@mentions`
  (`appForUser`, `appContext`: reads the viewer may already make). A canvas
  chat offers other canvas names, which `appForUser` drops silently while the
  chip stays in the text. That is a context/UI fix for the context unit.
- **delta-6, browser guard.** Unchanged; its comments now say it is a browser
  check. History rename/delete of old live-app Learn threads
  (`/api/ask/threads/<n>`) is still proxied to live `small-cp` and blocked
  only by that guard (T1 F6): a broader D7 contract decision.
- **duplication-22.** The double authorization (service binding, then
  `appForUser` on DB) happened only on the live-app path, which the dev worker
  now refuses before `apiAsk`.
- **Moment history (T5).** Existing live `learn_moments` rows, Vectorize
  `q:<id>` keys that name live ids (future `LEARN_DB` ids can collide with
  them), and cards that carry live `momentId`s stay as they are.
  `export-gold.mjs` reads the live D1 `small` while its comment calls it the
  dev D1; dev moments will not reach it once `small-learn-dev` has the table.
  Each is a separate decision; no migration or delete.
- **`learn_moments` in `small-learn-dev`.** Not added (owner decision 1, a
  separate go). Until then dev answers carry no `momentId` and Keep/Dismiss
  answers 400.
- **Stale comment in a frozen area.** `packages/web/src/agent/ask-stream.js`
  says attachments go to `/api/ask` because the dev worker handles
  `/api/learn/ask` as JSON only; it has handled multipart since `2828bc4`.
  Left for the Agent Bar owner.
- **Defense in depth (T6 a).** The `LearnVideos` and `LearnScenes` alarms use
  `learnMedia(this.env)` outside the dev worker's `LEARN_MEDIA` guard. That is
  safe while both dev configs bind `LEARN_MEDIA` (`learn-storage.test.js`).
- **inert-1, the tldraw lesson player.** Stays parked (owner default). The
  `editor`-gated code in `LearnPage`, `LearnCanvas.jsx`, `canvas-preview.js`,
  `learn-graph-storage.js`, `learn-video-canvas.js`, `sigmoid-demo.js`,
  `RegionPicker.jsx`, `region-targets.js`, `noteSnapshot`, `pinned`,
  `refreshSelection`, the `demo` object and `boardContext.pause` and
  `setAnswering` are untouched. Retiring it is an owner decision.
- **inert-4, `boardContext.preview`.** Kept with `previewKind` and
  `removeImage`: the paper-region half is live (right-panel reader to
  `paper_context.selection`). The canvas half goes only with inert-1.
- **inert-6, the My notes Learn Agent chat.** Documented in the architecture
  doc (sections 5 and 15): a non-sheet Learn chat that resumes the app's
  latest Learn thread of any origin. Whether it should stay is outside this
  spec; no change.
- **inert-10, server selection contract.** `/api/learn/selection` (index.js,
  dev-worker.js, `refuseCanvasAsk`), the `lesson_snapshot` contract in
  `apiAsk` and `repositoryAsk`, `validateLessonSnapshot` (live through the
  whiteboard explainer) and `sigmoid-context.js` stay.
- **U2 stale browser checks.** `e2e/learn-preview.spec.js` and
  `e2e/coaching.preview.js` still click the sigmoid demo pill and Clear
  selected context and route `/api/learn/selection`; they already could not
  pass (no editor, no Lesson views navigation). Left for U9 (inert-12/13),
  not deleted. Commit `5b705c3` says the tldraw selection listener was
  removed; it is parked, not removed.

- **U3 models-6, Agent Bar.** Agent Bar Learn asks still send no model, so
  they always run Auto and ignore Settings > Default model. The Agent Bar is
  a frozen area; the new picker copy says the pick reaches chat answers only.
- **U3 models-7, whiteboard `model` field.** `/api/learn/board` still honours
  a request `model` key that no client sends (Anthropic path only). Kept as
  the contract; pinned in `learn-models.test.js`.
- **U3 models-9, fallback policy.** Unchanged: Auto sends `claude-opus-5`
  with `fallbacks: 'default'` and the beta header; every explicit id (the
  Opus 5 pick, cards, the whiteboard) sends neither. It is a refusal
  fallback, not an availability one. Whether the explicit Opus 5 pick should
  also get it needs approved real calls; the `ask.js` comment now says the
  400 claim is unverified.
- **U3 models-10, thinking.** No Learn task sets thinking, effort or
  temperature; the model default thinks inside each `max_tokens`
  (`LEARN_TASKS` says so, and a test pins that no such key is sent).
  Forced `tool_choice` on cards and the whiteboard would 400 on the 5.5
  generation, which constrains any later model change.
- **U3 models-14, org AI settings.** `org_ai` never applies to Learn chat,
  grading, cards or the whiteboard (org null); course authoring applies it.
- **U3 models-15 and lifecycle-13, limits not moved.** No timeouts were added
  to the Anthropic or OpenAI fetches (C8). The whiteboard repair budget
  (`min(6000, max(2400, 2x))`), its 8 salvage rounds, the artifact body and
  argument caps, the canvas seed caps, tts 4000 and every browser copy
  (`learn-slash.js` 8000, `AdaptiveCanvas.jsx` 4000, `learn-board-request.js`)
  stay local literals: each has one site.
- **U3 duplication-10, alignment.** The whitespace-only question rule, the
  group wrapper over 4000, the grading prompt budget, the whiteboard answer
  cap and the missing `apiAsk` body cap are behavior, left for C5, C6 and C8.
- **U3 duplication-7 and models-12, what was not merged.** The card failure
  message keeps its own text (no API detail; C8). Tool-call extraction and
  the arXiv read branch stay duplicated (duplication-19). The pre-existing
  unused `anthropic` import in `learn-board.js` is left.
- **U3 duplication-15, ordering nuance.** With `SUBSCRIPTION_ONLY` on, a
  non-owner who sends a malformed card or whiteboard body now gets the 400
  before the 403.
- **U3 grading-12, diagnostics.** The grader posts to the chat route, so its
  `learn_model` line says `task: chat`; `LEARN_TASKS.grading` records its
  settings. It gets its own task name once `/api/learn/assess` (owner
  decision 3) exists. `learn_grades` still stores no served model.
- **U3 models-11, OpenAI served model.** On the opt-in OpenAI branch the log
  line's `served` is null (`fromOpenAI` drops the response model).
- **U3 models-18, OpenAI tool results.** Only the url image mapping was
  fixed; an `inspect_image` result still reaches OpenAI as JSON text, and
  PDFs and strict schemas are still dropped there. The branch is opt-in only.
- **U3 models-3, paid media in subscription mode.** `/api/learn/image`,
  `/api/learn/transcribe`, `/api/learn/tts` and FAL video stay available
  behind their paid confirmation in `SUBSCRIPTION_ONLY` mode; whether they
  should answer 503 like Jev is an owner decision. A multipart
  `/api/repositories/<repo>/ask` is not refused like a multipart
  `/api/learn/ask`; it still goes through the bridge, not a paid API.
- **U3 decision 4 environments.** No `LEARN_PLAN_MODEL` var was added. The
  remote secret sets of shared `small-cp-dev` and production were not read.

## Progress

- **U1 storage (C1), 2026-09-29.** Commits: `7f5d654` learnMomentsDb at every
  `learn_moments` statement; `67872d9` dev worker 403 for live-app Learn asks
  and 415 for other body types; `117e985` no ask-uploads copy or run-tool
  note for Learn attachments; `dae0d88` `REPOSITORY_SNAPSHOTS` in
  `wrangler.parallel.jsonc`; `ff1fddd` comment corrections (routes.js,
  flags.js, SharePage.jsx, index.js, canvases.js, dev-worker.js); `90b6b61`
  and `b5c6dd3` permanent storage tests; this doc. Done: delta-3 (moment
  paths and comments), delta-4, delta-5, delta-13 (binding), duplication-23,
  prompts-9, context-15, grading-2 (storage half), context-18 and delta-6
  (comments). Recorded: duplication-22, the sweep, legacy snapshots,
  mentions, moment history. Needs a decision: the clone recipe (delta-13).
- **U2 inert canvas wiring (C10 early refactors), 2026-09-29.** Refactors:
  `304be1a` zero-reference identifiers and imports (inert-9); `8207552`
  Explain on canvas leftovers (inert-8); `3853c31` the client snapshot and
  `/api/learn/selection` branch, `isCurrent`, `teachingSnapshot` (inert-2);
  `5b705c3` the pinned label chip and `boardContext.clear` (inert-3). Fixes,
  each with a test in `packages/web/src/learn-notes-view.test.mjs` shown
  failing first: `0175d45` no demo pill in the Learn Agent chat (inert-5);
  `8d51a6e` Return to lesson and Save and resume without an editor
  (inert-7); `ab71b38` My notes toggles back to the canvas (inert-19, the
  toggle option of its UX choice). Docs: inert-6, the architecture doc and
  coaching.md. Recorded: inert-1 (parked), inert-4, inert-10. UI changes
  (inert-5, inert-19) still need a deployed visual review on the session
  clone.
- **U3 models and limits (C4), 2026-09-29.** Test: `43b43355` the effective
  model per task through the real dispatchers (models-1). Refactors:
  `b74519b0` `learn-models.js` with `ASK_MODELS`, `askModel`, `LEARN_TASKS`
  (chat, grading, artifact, board) and the named limits (models-12,
  models-15, duplication-4, duplication-10, lifecycle-13, grading-12);
  `665324d6` `modelFailure` (duplication-7); `ec68eb22`
  `subscriptionOwnerRefusal` (duplication-15); `da16eff6` `MODEL_CHOICES`
  (models-13). Fixes, each shown failing first: `b1aeb33b` own keys only in
  `askModel` (models-8, duplication-5); `33092d23` OpenAI only with
  `LEARN_PLAN_MODEL` and never in subscription mode (models-2, models-3,
  owner decision 4); `30cfdfbc` and `3554560e` `revise_section` refused in
  subscription mode (models-3); `78718456` the repository owner gate and
  course 503 (models-4); `823e9023` url images on the OpenAI path
  (models-18); `84a661a1` picker scope copy (models-5). Feature: `77f03476`
  the `learn_model` diagnostic line (models-11). Docs: `d19d92fd` the Jev
  transport comment (models-16); the architecture doc sections 9, 10.3, 15
  and 17 (models-17) and the `ask.js` fallback comment (models-9). No prompt
  text changed. Recorded: models-6, 7, 9, 10, 14, the limits left local, the
  paid media question. UI changes (models-5 copy) still need a deployed
  visual review on the session clone.
