# Rabbit Hole — Avatar Teacher V1

## Status

**AUTHORIZED FOR ARCHITECTURE / DEVELOPMENT SPEC ONLY.**

This document defines the first Rabbit Hole architecture for short AI-avatar teacher clips.

It does **not** authorize:
- production deployment,
- paid avatar generation,
- automatic Tutor-triggered generation,
- realtime Live Avatar,
- broad rollout,
- cloning any real person's likeness without required consent.

Primary V1 provider: **HeyGen**.

Development may use the official HeyGen MCP for rapid prototyping and tool discovery.

Production Rabbit Hole must use a backend/provider API integration rather than depending on Claude Code MCP.

Reconciled on 2026-10-04 against canonical main `74d20468` and HeyGen's public documentation. File and line references below are to that commit. See:
- §30 for the conflicts that were found and how each was resolved;
- §31 for the dated HeyGen research snapshot;
- §32 for what is authorized next and what stays deferred.

Where an earlier section and §4.1 (Tutor action), §6 (AvatarBrief) or §8 (provider interface) disagree, those three sections win.

The owner accepted this review on 2026-10-04 and locked eight decisions:
- the action name `suggest_avatar_clip`;
- a stock V1 face;
- HeyGen's native voice;
- Rabbit Hole-generated course clips that learners never pay for;
- no autoplay;
- no suggestions in Voice Mode (superseded the same day, see below);
- the HeyGen account prerequisites;
- the shared reload fix as an AV5 prerequisite.

They are written into the sections they govern and listed in §32. AV2–AV4 groundwork is authorized, with no paid calls.

**Owner correction, 2026-10-04 (later the same day).** Voice and Chat are communication modes; Avatar clips, Motion, cards and graphs are learning materials. Voice Mode never disables avatar clips, so decision 6 is superseded. Only clip playback pauses the Voice audio loop (§4.3). The correction also reshapes the action:
- nine pedagogical moments;
- `learning_goal`, which replaces `content_goal`;
- an internal `visual_value`;
- a six-question trigger validator;
- an artifact routing principle.

See §3, §4.1–§4.3 and §30 rows 32–36.

---

# 1. Product idea

Rabbit Hole already has several teaching primitives:

```text
Tutor
├── text response
├── canvas card
├── technical /motion explainer
└── avatar teacher clip
```

The avatar teacher is a different primitive from `/motion`.

Use avatar video when **human presence helps the pedagogy**:
- greeting a learner,
- introducing a section,
- transitioning between sections,
- giving checkpoint feedback,
- welcoming the learner into a Rabbit Hole,
- reconnecting a Rabbit Hole to the parent idea,
- summarizing completion,
- proposing what comes next.

Do **not** use an avatar for every Tutor response.

The avatar is an occasional teacher-presence layer, not the default chat channel.

---

# 2. V1 capability

V1 supports **asynchronous prerecorded avatar clips**.

Canonical mode:

```text
avatar_clip
```

Future, deferred mode:

```text
live_avatar
```

V1 target durations:
- normally 3–15 seconds,
- maximum 30 seconds.

Prefer shorter clips whenever possible.

Examples:

```text
"Welcome to Attention. In this section, you'll learn how a token decides which earlier information matters."

"You just worked through causal masking. Next we'll look at how softmax turns the remaining scores into weights."

"You've finished this Rabbit Hole. Now let's connect what you learned about softmax back to causal attention."
```

---

# 3. Good Tutor trigger cases

Initial allowlisted purposes:

```text
section_greeting
section_transition
concept_intro
checkpoint_feedback
rabbit_hole_intro
rabbit_hole_return
course_completion
```

The Tutor should generally **not** trigger avatar generation for:
- every ordinary answer,
- every clarification,
- every quiz response,
- every failed practice attempt,
- every canvas action,
- routine factual questions.

A useful initial product constraint is:

```text
maximum ~1 automatically suggested avatar clip per section
```

unless the learner explicitly requests an avatar/teacher explanation.

Exact limits can remain configurable.

**Communication modes vs learning materials** (owner correction 2026-10-04; it supersedes locked decision 6).
- Voice and Chat are **communication modes**.
- Avatar Teacher clips, Motion, cards, graphs, quizzes and later artifacts are **learning materials**.
- The two are independent dimensions. **Voice Mode never disables avatar clips.**

Example. The learner asks by voice, "Why does attention need softmax?"
- The Voice Tutor answers: "Softmax turns those raw scores into usable weights. I can show you a short professor explanation here."
- The canvas gets `[Teacher clip · How to think about softmax · 9 s]`.

The clip is extra learning material, not a second Tutor conversation. Only actual playback coordinates audio with Voice (§4.3).

**The trigger is pedagogical value.** The planner asks one question: what does *seeing* a human teacher add here, beyond text or speech? If the answer is effectively nothing, the Tutor answers in plain Chat or Voice. Never trigger a clip:
- because the Tutor has something to say;
- as a talking head for every response;
- for routine factual questions.

| Good | Not good |
|---|---|
| "Welcome to Attention. Here's the question this section will answer." | a routine factual question |
| "Before we continue, notice the difference between the fallback and flash branches." | a clip for every response |
| "Let's reconnect what you learned about softmax to the attention mechanism." | |

**The V1 router signals.** The Tutor on main has no "section" or "course completion" state:
- Its evidence lives in a session-scoped browser store (`packages/web/src/learn-tutor-evidence.js:1-23`).
- Its router rows are `slash`, `returned`, `off_slice`, `gap`, `gap_inline`, `misconception`, `misconception_explain`, `uncertain_unsettled`, `uncertain`, `not_yet_observed` and `understood` (`packages/web/src/learn-tutor.js:144-177`).

**Moments (V1).** Nine moments replace the allowlist above, and the earlier purposes fold into them. Each is either canonical (Rabbit Hole pre-generates it, decision 4) or personalized (learner-paid, deferred):

| Moment | Folds in | Canonical or personalized | The Tutor may suggest it when |
|---|---|---|---|
| `orientation` | section greeting, concept framing (`concept_intro`) | canonical | a hole's opening turn; row `not_yet_observed` |
| `transition` | `section_transition` | canonical | row `understood`; needs a `ladderStep` |
| `takeaway` | none | canonical | row `understood` |
| `reflection` | `checkpoint_feedback` | canonical (standard wording; no learner evidence) | row `understood` or `returned` |
| `rabbit_hole_intro` | none | canonical | a hole's opening turn |
| `rabbit_hole_return` | none | canonical | row `returned` |
| `completion` | `course_completion` | canonical | only on the learner's explicit request (no completion state exists) |
| `human_explanation` | none | canonical if a product clip exists for (moment, concept); otherwise personalized | row `not_yet_observed` |
| `demonstration` | none | the same as `human_explanation` | row `not_yet_observed` |

A greeting on *entering* a section has no Tutor turn. Its clip is still product content (`orientation`), placed later by product UI.

The Tutor never suggests a clip on the rows that need the learner's attention elsewhere, or that are a direct request: `gap`, `gap_inline`, `misconception`, `misconception_explain`, `uncertain`, `uncertain_unsettled`, `slash`, `off_slice`. A learner's explicit request for the teacher, professor or avatar allows every moment on any other row.

**Canonical vs personalized** (decision 4, kept):
- **Canonical.** A clip that depends only on its moment, concept and course (`personalization: none`). Rabbit Hole generates it once, ahead of time, and every learner reuses it. Learners never pay for it, and it is offered only when ready.
- **Personalized.** A `human_explanation` or `demonstration` with no product clip, or anything learner-specific. This is the learner-paid Generate path (§15), and it is deferred.

"~1 per section" becomes, in V1, two limits counted in the Tutor's session store:
- at most one `suggest_avatar_clip` per turn;
- at most one suggestion per (canvas or hole, concept) per session.

---

# 4. Tutor must remain provider-independent

The Tutor must never emit provider instructions such as:

```text
call_heygen
```

Instead introduce a semantic action conceptually like:

```text
TutorAction
{
  type: "suggest_avatar_clip",
  moment: "orientation" | "transition" | "takeaway" | "reflection" | "human_explanation"
        | "demonstration" | "rabbit_hole_intro" | "rabbit_hole_return" | "completion",
  learning_goal: "...",
  visual_value: "...",
  max_duration_seconds: 12
}
```

The name is `suggest_avatar_clip` (owner decision 2026-10-04):
- At action time the Tutor neither generates nor shows anything. It only suggests.
- The name also avoids the bare word `avatar`, which in the code already means the user's profile picture (§30).

Tutor chooses **why / when** a human-teacher moment is useful.

The artifact/provider layer chooses **how** to generate it.

Conceptual architecture:

```text
Tutor
  ↓
suggest_avatar_clip
  ↓
Avatar Director
  ↓
AvatarBrief
  ↓
AvatarProvider
  ↓
HeyGenAvatarProvider
```

Future providers can be added without rewriting Tutor logic.

## 4.1 Tutor action contract (V1)

The conceptual action above becomes one member of the Tutor's closed action list (`ACTION_TYPES`, `packages/control-plane/src/agents/learn-tutor.js:130`):

```text
{ type: "suggest_avatar_clip",
  moment,                  // §3 table
  concept,                 // a registry concept id (CONCEPTS); with moment and course, the canonical slot
  to_concept?,             // transition and rabbit_hole_return: where the learner goes next
  learning_goal?,          // <= 120 characters; a Director-only hint (below)
  visual_value,            // <= 200 characters; why SEEING a human teacher helps; trigger-validator input only (below)
  max_duration_seconds? }  // integer 3..30; default 8
```

**What changed from the conceptual action:**
- **`moment`, not `purpose`.** The planner tool has one flat action-item schema, and its `purpose` is already the `ask_question` enum `diagnose | predict | explain_back | transfer` (`agents/learn-tutor.js:154`). The AvatarBrief's `purpose` takes the same nine values as `moment`.
- **`concept` is kept.** The owner's example has no concept field, but a canonical clip is keyed by moment, concept and course (§14), so the Tutor must name the concept. There is no `context_refs`: `concept` and `to_concept` are resolved against `CONCEPTS`, as `suggest_dive` resolves its concept.
- **`learning_goal` replaces `content_goal`.** It is the owner's renamed field, with the same bounds and rules.
- **`visual_value` is new.** It is internal planning metadata.

**`learning_goal` handling** (the `content_goal` reconciliation, renamed). The first reconciliation (f639a825) removed free text from the planner: it can carry the learner's words into a script, and it breaks cross-learner caching. The owner kept the field. Both concerns are met by bounding it:
- It is at most 120 characters.
- It goes only to the Avatar Director, as a hint. It never reaches the provider, the chip label, a log line or any cache key (the script-slot and render keys, §14).
- The validator drops the field, but keeps the action, when the field:
  - contains code characters (the speakable test, `` /[`{}<>]\|=>/ ``);
  - contains an email address, URL, @-handle or long digit run;
  - repeats any five consecutive words of the learner's message (`turn.raw_user_message`, which the validator already holds).

  The drop is logged without the text, as `explicit_request` already is (`learn-tutor-validate.js:84-85`).
- **Canonical moments ignore it.** A canonical clip is keyed by moment, concept and course, and its script is product content written ahead of time (§14). So `learning_goal` changes nothing a learner sees from a canonical clip. It matters only to personalized clips (deferred, §32).

**`visual_value` handling** (decision 2026-10-04):
- **Required.** No stated value means no suggestion (trigger question 2 below).
- **Read only by the browser validator.** It is stripped from the accepted action. It therefore never reaches the chip, the session store, the trace, the Avatar Director, the brief, a cache key, a log line or the provider.
- **Kept out of the Director.** The Director writes what the teacher says, from authored content. Why a human presenter helps is a routing reason, not teaching content, and passing it would open a second free-text channel from the planner into a script.

**Trigger validator.** Before a suggestion surfaces, the validator answers the six questions in order (`learn-tutor-validate.js`; no value means no suggestion):

| # | Question | How it is decided | Stage |
|---|---|---|---|
| 1 | Is this an approved avatar moment? | the moment is allowed for this row or intent (§3 table), or the learner explicitly asked; blocked rows never allow one | route |
| 2 | Does human visual presence add pedagogical value? | the planner must state `visual_value`; judging the value is the planner's job (§4.2), and the validator requires the stated reason | route |
| 3 | Would Motion, a card or a graph be more appropriate? | if the same plan shows or focuses a card because the learner explicitly asked to see it (`mode: navigate`), the card is the material, and the clip is dropped. Otherwise it is the planner's routing (§4.2); Motion is not a Tutor action yet. | route |
| 4 | Is it redundant with something already on the canvas? | the same slot is already on this canvas, or was already suggested here this session | route |
| 5 | Is there already a reusable cached clip? | a ready canonical clip for the slot → `offer: "play"` (free) | resource |
| 6 | Does generation require credits? | no ready clip: a canonical-only moment is dropped (learners never pay for canonical clips); `human_explanation` or `demonstration` → `offer: "generate"` (the personalized paid path, §15, deferred) | resource |

The other existing rules still apply:
- at most one suggestion per turn;
- one per (canvas or hole, concept) per session;
- the three-action cap;
- `transition` needs a `ladderStep`;
- schema: the moment and concepts are known, `max_duration_seconds` is 3..30, and the text fields respect their bounds.

**Voice Mode does not suppress it.** The same plan validated on a typed turn and on a voice turn gives the same suggestion: Chat and Voice can produce the same learning material.

It is never the turn's only action:
- the router always keeps `respond_text` allowed (`finish`, `learn-tutor.js:149`);
- a fast plan with no words already escalates to Opus (`fastPlanProblem`, `learn-tutor-routes.js:194-199`).

So the Tutor's text or spoken turn is never lost.

**Execution (AV6):**
- **`offer: "play"`.** A chip such as `Teacher clip · How to think about softmax · 9 s`. The chip places the card; on the learner's explicit request the Tutor may place it directly, as with `show_authored_card`. Either way the clip plays only when the learner presses Play.
  - It never autoplays, even in Voice Mode, and there is no charge.
  - In Voice Mode the spoken reply may say, in one sentence, that the clip is on the canvas.
- **`offer: "generate"`** (personalized, deferred). The suggestion leads to a proposal. The learner chooses Generate; then the skeleton reservation, the HeyGen job and the avatar video card follow.
  - Voice Mode stays on as the communication mode throughout.
  - Only actual playback pauses its audio loop (§4.3).
- **The Tutor never reaches the provider or the Director.** No Tutor path calls either.

**Planner changes (in the AV2 groundwork schema, switched on in AV6):**
- `ACTION_TYPES` and the `TUTOR_TOOL` item schema gain the type and the fields above.
- `PLANNER_SYSTEM` gains three lines:
  - the value question and the routing principle (§4.2);
  - the field rules (`learning_goal` in the planner's own words, never the learner's);
  - the Voice sentence that the clip is on the canvas.
- The existing "never generate new artifacts" line (`agents/learn-tutor.js:176`) stays true.
- `tool_choice` stays `{type: "auto"}`: `claude-opus-5-5` answers HTTP 400 to a forced tool choice (`agents/learn-tutor.js:215-217`; Motion V1 spec §4.9).

Adding the type changes the planner request on every turn. That includes the cached prefix, which the Voice and golden-trace tests pin. So the action sits behind an off-by-default knob, `TUTOR_AVATAR` (owner decision 2026-10-04), in line with Tutor v2's off-by-default rule. With the knob off:
- the type and its `PLANNER_SYSTEM` lines are absent;
- the planner request is byte-identical to today.

Turning it on is not authorized yet (§32). It needs the owner's GO and a re-run of the Tutor benchmark.

The Tutor's locked decisions still list "`generate_artifact`, `suggest_motion` and the paid-tool confirmation UX" as open (`docs/features/tutor-v1-locked-decisions.md:249, 260, 553`). `suggest_avatar_clip` leaves that item open: its canonical path is free, and its paid personalized path is deferred.

## 4.2 Artifact routing principle

| What the learner needs | Material |
|---|---|
| static structure | a card or a diagram |
| a changing process or mechanism | Motion |
| human presence, framing, gesture or emphasis | Avatar Teacher |
| both | Avatar plus Motion, composed or sequenced later (§12; not implemented) |
| neither | a normal Tutor response |

A future session, not V1:
1. The Voice Tutor says, "First listen to the intuition."
2. An avatar clip plays.
3. A Motion clip shows the mechanism.
4. The Voice Tutor resumes.

## 4.3 Voice Mode and clip audio (AV5/AV6)

Voice Mode stays on while a clip is suggested, placed or generated. Only actual **playback** coordinates audio. When a clip plays while Voice Mode is on:
1. Pause Tutor TTS.
2. Pause or mute STT capture, so the clip is not transcribed.
3. Play the clip.
4. When it ends or is stopped, restore the mic, the listening state and the normal Voice loop.

Voice Tutor speech and clip audio never overlap. Later, narrated Motion uses the same principle.

**The seams:**
- `createVoiceSession({ stt, tts, tutor })` in `packages/web/src/voice-session.js`. Its states are off, listening, thinking and speaking. It already calls `tts.stop()`, `stt.pause()` and `stt.resume()` on interrupts and on the speaking-to-listening transition.
- `createScribeStt` in `voice-stt.js` has `pause` and `resume`; `createFishTts` in `voice-tts.js` has `speak` and `stop`.
- `LearnVoice.jsx` exposes the session to the page: `state`, `enter`, `exit`, `interrupt`, `say`.

AV5/AV6 adds a session-level hold and release around clip playback, on those same calls. The session half is built (§33): `hold()` returns `release()`; the clip player that calls them is AV5.

---

# 5. Raw Tutor text must not go directly to HeyGen

Same principle as Rabbit Hole `/motion`.

Do **not** send:

```text
"greet learner before Attention"
```

directly to a video provider.

Instead:

```text
Tutor intent
+ learner context
+ course context
+ source grounding
        ↓
Avatar Director
        ↓
AvatarBrief
        ↓
short grounded spoken script
        ↓
HeyGen provider
```

The provider should receive the final spoken script plus avatar rendering configuration, not raw private Tutor context.

## 5.1 Avatar Director boundary

| | |
|---|---|
| **Allowed inputs** | the purpose (`moment`) and the registry concept ids. The authored content of those concepts: `CLAIMS` statements, the cards' `learningQuestion` and titles, and up to 3 pinned source notes per card, at the course's pinned commit. The lesson/TOC titles. Learner-scope briefs only: the ids of concepts that have a settled `pass` this session (with `personalization: session_concepts`), and the Tutor's validated `learning_goal` as a hint (§4.1). A canonical brief never takes `learning_goal`. `visual_value` is never an input (§4.1). |
| **Forbidden inputs** | the raw learner message or voice transcript; Tutor turns and text, except the validated `learning_goal` hint on learner-scope briefs; the Tutor's `visual_value`; evidence events, probabilities or misconception ids; canvas state; private repository source (V1 covers the public `karpathy/nanoGPT` course only, the only place the Tutor runs: `docs/features/production-tutor-entry.md`); identity (email, name, org); auth data; model or provider ids |
| **When it runs** | canonical moments: once per slot, when Rabbit Hole prepares product content (§14), never on a learner's turn. Learner-scope clips (deferred): on the learner's request, before the paid proposal. |
| **Output** | a validated AvatarBrief (§6) with `script`, or a failure. A failure produces no clip and no proposal. The Tutor's text answer stands. |
| **Grounding** | every factual phrase maps to a `source_refs` entry. The script may state only claims that are already in the concepts' `CLAIMS` statements or `learningQuestion`. |
| **Script limits** | at most `floor(duration_seconds × 2.4)` words, about 150 words a minute (8 s = 19 words, 15 s = 36, 30 s = 72). At most 2 sentences, or 3 above 15 s. No code characters (the Tutor's speakable test, `` /[`{}<>]\|=>/ ``, `learn-tutor-validate.js:38`). No equations. No mastery or score wording. No mention of the Tutor, the model, the provider or "learner state". |
| **Model call** | role `AVATAR_DIRECTOR_MODEL`, resolved through `LEARN_TASKS` (`learn-models.js`, task `avatar_director`; the reviewer is task `avatar_script_reviewer`) and never named in the brief or a schema. The initial development mapping of both is `claude-opus-5-5` (owner, 2026-10-04): a development configuration, not a product decision. `tool_choice: auto` with one output tool, harness validation and at most one schema-only re-ask, as in Motion V1 §4.8–§4.9. Never the artifact path's forced `{type: "any"}` (`learn-artifact.js:53`). |
| **Review** | a fresh, blind, text-only script reviewer, with the blocking categories unsupported claim, mastery claim, internal language, code/equation and over length. At most one repair. The owner also approves every canonical script (§14) before it is generated as product content. |

---

# 6. AvatarBrief

Define one canonical structured request.

Final V1 schema. This section is the only definition; other sections reference it.

```text
AvatarBrief {
  id
  brief_version                  // "avatar-brief/1"
  prompt_spec_version            // Director prompt template version; part of the script-slot key
  purpose                        // the nine moments (§3): orientation | transition | takeaway | reflection
                                 // | human_explanation | demonstration | rabbit_hole_intro | rabbit_hole_return | completion
  origin                         // product (canonical, prepared by Rabbit Hole) | learner_request | dev_fixture
  scope                          // cache scope (§14): { kind: "public_course", course: "karpathy/nanoGPT@<commit>" }
                                 //                  (canonical product content; never learner-paid)
                                 //                  | { kind: "learner" }   (personalized; never shared; deferred)
  learning_goal?                 // learner scope only: the Tutor's validated hint (≤ 120 chars, §4.1);
                                 // never sent to the provider, never in a key, never logged

  learner_context {              // registry ids only (CONCEPTS), never free text
    current_concept
    next_concept?
    from_concept?                // rabbit_hole_return: the hole's concept
    personalization              // none (V1 default) | session_concepts
    session_concepts[]?          // only with session_concepts: ids with a settled pass this session;
  }                              // never evidence detail, transcript or score

  teaching_goal                  // one sentence, written by the Director from the purpose and sources
  source_refs[] {
    id                           // S1, S2, ...
    kind                         // card | lesson | code
    card_id?
    repository?
    commit?                      // full SHA; required for kind = code
    path?
    start_line?
    end_line?
  }

  duration_seconds               // integer 3..30; default 8

  script_constraints {
    max_words                    // floor(duration_seconds × 2.4)
    max_sentences                // 2; 3 when duration_seconds > 15
    plain_speech: true
    no_code: true
    no_equations: true
    no_unverified_claims: true
    no_internal_tutor_language: true
    no_mastery_claims: true
  }

  must_say[]
  must_not_claim[]

  script {                       // Director output, validated by the harness (§5.1)
    text                         // the ONLY learner-facing text the provider ever receives
    words
    estimated_seconds
    source_ref_ids[]
  }

  render {                       // provider-neutral; the adapter maps it (§8)
    avatar_profile               // a Rabbit Hole profile id, e.g. "rh-teacher-1"; never a provider id
                                 // (V1: a HeyGen stock/licensed avatar, §17)
    voice_profile                // a Rabbit Hole profile id (V1: a HeyGen native voice, §18)
    tone                         // calm | warm | encouraging
    framing                      // head_shoulders | half_body
    expressiveness               // low | medium
    motion_direction?            // short gesture note; used only where the engine supports it (§31)
    background_mode              // transparent | solid
    presentation                 // card | overlay
    output {
      alpha                      // true → WebM with alpha requested (§11)
      aspect_ratio               // "16:9" | "1:1" | "9:16"
      resolution                 // "720p" | "1080p"
    }
    captions: true
  }

  provenance {
    learner_turn_id?
    canvas_id?
    director { role: "AVATAR_DIRECTOR_MODEL", resolved_model }
    created_at
  }
}
```

**Harness validation:**
- every id resolves against its registry;
- `duration_seconds` is an integer from 3 to 30;
- `script` meets `script_constraints` (§5.1);
- every `script.source_ref_ids` entry exists;
- `personalization: none` carries no `session_concepts`;
- a `public_course` brief carries no `learning_goal`;
- no model id, provider id, credential, email or name appears anywhere in the brief.

**What changed from the conceptual schema:**
- `learner_context.completed_topics[]` became registry concept ids plus an explicit `personalization` switch. The Tutor's evidence is session-only browser state, and a "completed" list invites the mastery claims the Tutor forbids (`agents/learn-tutor.js:181`).
- `tone`, `framing` and the other render settings, plus `background_mode` and `output_format`, moved under `render`.
- `provider_preferences` was dropped. Engine and provider choices live in the adapter's configuration, and they enter only the render key (§14).

Do not lock provider-specific model identifiers into Tutor or the core brief.

Provider-specific settings should live behind the adapter.

---

# 7. Script-generation rules

The Avatar Director should produce a short spoken script.

Requirements:
- natural plain speech,
- usually 1–2 sentences,
- short enough for the chosen duration,
- no raw code unless explicitly required,
- no unnecessary equations,
- no invented learner history,
- no unsupported claims,
- no references to internal Tutor state,
- no mention of model/provider internals,
- no awkward phrases such as "according to my learner-state representation",
- no mastery claims or scores ("you've mastered", "you've got X"). Say what happened instead: "You just worked through the causal mask." The Tutor never labels the learner or gives a mastery score (`agents/learn-tutor.js:181`; `docs/features/adaptive-tutor-v1.md`, T1).

For section transitions, prefer one compact idea.

Example:

```text
Next we're going to look at attention: how a token decides which earlier information matters most.
Keep one question in mind — what should this token pay attention to right now?
```

---

# 8. Provider interface

Define a provider abstraction:

```text
AvatarProvider
├── HeyGenAvatarProvider
└── future providers
```

Provider responsibilities:
- validate provider config,
- submit generation job,
- poll asynchronous status,
- retrieve output,
- normalize metadata,
- return a Rabbit Hole-controlled artifact,
- expose provider errors safely.

Tutor and Avatar Director should not know HeyGen endpoint details.

**Concrete interface.** The adapter reuses the provider-neutral asynchronous contract that LearnVideos already runs: "submit(input) → durable ticket; poll(ticket) → null while pending, or GeneratedVideo when complete" (`packages/control-plane/src/video-provider.js:1-3`; Motion V1 uses the same contract).

```text
avatarProvider(env) → AvatarProvider      // throws "not configured" unless LEARN_AVATAR_PROVIDER=heygen
                                          // and HEYGEN_API_KEY are set (the videoProvider pattern, video-provider.js:4-8)
AvatarProvider {
  version                                 // adapter + engine + relevant config; part of the render key (§14)
  capabilities(profile) → { engines[], alpha, max_seconds, resolutions[], aspect_ratios[] }
                                          // from configuration plus the provider's look listing; cached
  submit(renderInput) → ticket            // { id, provider, engine, submitted_at }
  poll(ticket) → null | { videoUrl, contentType, durationSeconds, captionsUrl?, provider, generationId, engine }
  remove?(ticket)                         // delete the provider-side copy once our copy is stored (§16)
}
renderInput = { script_text, provider_avatar_id, provider_voice_id, engine, alpha, aspect_ratio,
                resolution, captions, title: "rh-avatar-<render key prefix>" }
```

The adapter resolves `avatar_profile` and `voice_profile` (Rabbit Hole ids) to provider ids from server-side configuration. It never takes them from the brief or the browser.

**Owned by the job runner, not the adapter** (the LearnVideos pattern, `learn-video.js:49-149`):
- the download, against an allow-listed output host with a content-type check;
- the size cap (40 MB) and the R2 write;
- the cache index;
- alarm polling every 10 s, with a 30-minute ceiling;
- one generating job at a time per Durable Object.

**Job states.** These are the existing LearnVideos states plus the existing `uncertain` flag:
- `generating`: a ticket is stored;
- `ready`: the clip is in R2;
- `failed`;
- `uncertain: true`: the submission could not be confirmed.

The script and the proposal come before a job exists, so they need no new state.

**Never repeat a paid POST automatically.** The job is persisted before submission, and a lost response becomes `uncertain`, exactly as today (`learn-video.js:77-83`). HeyGen v3 also accepts an `Idempotency-Key` that "replays response within 24 hours" (§31). The adapter sends the render key as that header, as a second line of defence, not as a reason to retry.

**Normalized errors.** These are safe to show and to log. A provider body never reaches the browser, as in Voice (`docs/features/voice-tutor-mvp.md`: "a 502 with a short message and no provider body").

| Category | Cause |
|---|---|
| `not_configured` | no provider or key on this Worker |
| `unsupported_config` | engine, alpha, duration or resolution not available for the profile (HeyGen: "This video avatar does not support webm output…") |
| `rejected_content` | provider moderation |
| `provider_credits` | insufficient provider credits or quota |
| `rate_limited` | HTTP 429. The submit is never auto-retried; the learner may confirm again later. |
| `provider_failed` | the job ended `failed` (HeyGen `failure_code` recorded, message not shown) |
| `timeout` | not complete within 30 minutes |
| `submission_uncertain` | the submit outcome is unknown |
| `download_failed` | wrong host, wrong content type, or over the size cap |

**Downgrades:** a downgrade is always visible.
- Alpha unavailable → the §11 fallback, recorded in provenance.
- An engine fallback (Avatar V → Avatar IV) only when configured. It is recorded in provenance and changes the render key.
- Never a different avatar or voice.

---

# 9. HeyGen production path

Production Rabbit Hole should call HeyGen through its backend/API integration.

Do **not** make production depend on Claude Code MCP.

Conceptually:

```text
rabbit-hole backend
  ↓
HeyGen REST/API
  ↓
video_id
  ↓
poll
  ↓
download result
  ↓
Rabbit Hole storage
```

Investigate the current HeyGen v3 video API and current supported avatar engines at implementation time.

Preferred policy:

```text
Avatar V
→ use when the configured look/Digital Twin supports it

Avatar IV
→ fallback when Avatar V is unavailable
```

Do not hard-code this assumption into Tutor actions.

Provider capability detection belongs inside the HeyGen adapter.

**Production API plan, against the docs read on 2026-10-04 (§31):**
- **API version.** Build on **v3 only**. HeyGen sunsets v1 and v2 on 2026-10-31 ("v3 is live and recommended for all new development"). That includes the old `/v2/video/generate` and `/v1/video.webm`.
- **Submit:** `POST https://api.heygen.com/v3/videos` with header `X-Api-Key: HEYGEN_API_KEY` and `Idempotency-Key: <render key>`.
  - Body: `{ type: "avatar", avatar_id, script, voice_id, engine: { type: "avatar_v" | "avatar_iv" }, output_format: "webm" | "mp4", resolution: "1080p" | "720p", aspect_ratio, caption?, title }`.
  - The response is `data.video_id`.
- **Status:** `GET /v3/videos/{video_id}` → `pending | processing | completed | failed`, with `video_url`, `duration`, `captioned_video_url` / `subtitle_url` and `failure_code`.
  - V1 polls from the existing 10 s alarm.
  - Webhooks (`POST /v3/webhooks/endpoints`, an HMAC-SHA256 `signature` over the raw body, retries for 24 h) are deferred until polling is measured too slow or costly. Polling needs no public callback route and no extra secret.
- **Output.** `video_url` is presigned and expires ("limited expiry window"; no day count is documented for v3). Download it into `LEARN_MEDIA` on the first `completed` poll, then call `DELETE /v3/videos/{video_id}` (§16).
- **Engine.**
  - Avatar IV is the v3 default and accepts studio avatars, digital twins and photo avatars.
  - Avatar V is documented for digital twins only. Its eligibility is the look's `supported_api_engines` (`GET /v3/avatars/looks/{look_id}`).
  - **V1 uses a HeyGen stock/licensed avatar (owner decision 2026-10-04),** so V1 renders on whatever engine that stock look lists in `supported_api_engines`. Today that is Avatar IV.
  - The preferred policy above (Avatar V first) applies only once a Rabbit Hole digital twin exists (§17).
  - The adapter still picks per profile from `supported_api_engines`; nothing is hard-coded.
  - Avatar III is the cheap fallback, and only a configured option for the AV8 cost benchmark.
- **Secret and configuration** (proposed names; none exists today):
  - `HEYGEN_API_KEY` is a Worker secret, and the API credentials are owned by Rabbit Hole (§10).
  - It is set on the development Worker only, and only once the account prerequisites in §10 are met and the owner approves the spend. Until then, AV3 runs against a test stub.
  - `LEARN_AVATAR_PROVIDER=heygen` is a var.
  - Neither is set on the production Worker before AV9.
  - This matters because `rabbit-hole-app` reuses `dev-worker.js` unchanged, so any route added for development also ships to production (`docs/features/rabbit-hole-production.md`, "Production entry"). The unconfigured provider is that route's off switch.
- **Limits.**
  - Pay-as-you-go concurrency is 10 renders; beyond that the API returns 429 with `Retry-After`.
  - Script text is at most 5,000 characters.
  - V1 clips (≤ 72 words) are far inside both. One generating job per Durable Object already keeps concurrency low.

---

# 10. HeyGen MCP — development only

Use the official HeyGen MCP for development/prototyping and prompt exploration.

Claude Code setup:

```bash
claude mcp add --transport http heygen https://mcp.heygen.com/mcp/v1/
```

Authenticate using the provider's normal MCP flow.

Use MCP for:
- inspecting available avatar tools,
- exploring stock avatars / Digital Twins,
- testing prompts,
- prototyping body-motion directions,
- comparing Avatar IV vs Avatar V (later: Avatar V needs a digital twin, and V1 uses a stock avatar, §17),
- testing transparent WebM,
- checking generation latency,
- evaluating quality before building the provider adapter.

Do **not** make the Rabbit Hole production runtime invoke Claude Code or MCP.

Canonical split:

```text
MCP
→ development / prototype / provider exploration

REST/API
→ Rabbit Hole production integration
```

**Development MCP workflow (AV1), checked against HeyGen's docs on 2026-10-04 (§31):**

1. **Install.** The command above is HeyGen's documented Claude Code install. Add `-s user` for user scope. Run `/mcp` once to complete the browser OAuth; there is no API key.
2. **Account prerequisites** (owner decision 2026-10-04). All five must hold before any paid prototype, whether MCP or API:
   - a HeyGen account owned by Rabbit Hole;
   - API credentials owned by Rabbit Hole;
   - provider training on our inputs disabled, where the account allows it (§16);
   - an explicit spending/credit ceiling;
   - no dependency of anything production-facing on a personal account.
3. **Credits.** MCP generation "draws on your existing HeyGen plan's credits". That is the web plan, not the API pay-as-you-go wallet AV3 will use. So every MCP generation is paid.
   - No paid MCP or API call is made until step 2 holds **and** the owner explicitly approves the spend.
   - Every actual prototype generation needs that approval.
4. **Explore before paying.** Discovery tools such as `list_avatar_groups`, `list_avatar_looks`, `get_avatar_look` and `list_voices` are expected to cost nothing. Check that against the account's credit balance before and after; it is UNVERIFIED (§31).
5. **Inputs are fixtures only.** The prototype scripts in §21, written by hand or by the AV2 Director from fixtures. Never a learner's words, a transcript, private source or anything from a real session.
6. **Generate.** Use `create_video` and `get_video` for the §21 set with a public stock/licensed avatar look picked by the §32 selection rule (interpretation 4), and a HeyGen native voice: MP4 first, WebM alpha only as a separate experiment after MP4 succeeds. Record the video id, engine, settings, wall-clock latency and credits used.
7. **Clean up.** Download what the evaluation needs to the job's temp folder (`.claude/jobs/<id>/tmp/avatar/`, never committed). Then `delete_video` each prototype on HeyGen.
8. **Promote nothing.** No MCP output becomes a learner-facing asset. Canonical product clips come only from the REST path (AV3–AV4), with provenance.

The production runtime never calls MCP, Claude Code or the Video Agent tools (`create_video_agent`). The MCP is only a quick, interactive way to judge quality, latency and alpha before AV3 is written.

---

# 11. Transparent avatar output

Transparent teacher video is a high-priority use case.

Where supported, request:

```text
WebM + alpha channel
```

This enables:

```text
Rabbit Hole canvas
┌──────────────────────────────┐
│ technical diagram           │
│                             │
│                  teacher    │
│                  avatar     │
└──────────────────────────────┘
```

Potential placements:
- bottom-right overlay,
- beside a diagram,
- section transition,
- on top of a Motion explainer,
- temporary canvas overlay,
- intro/outro layer.

Opaque MP4 remains supported.

**Plan, checked against the docs on 2026-10-04 (§31):**

1. **Requesting alpha.** HeyGen v3 returns "a WebM file with a real alpha channel" when the request sets `output_format: "webm"`. Background removal is then automatic, and a `background` value in the same request is rejected.
   - The look must be "trained with matting". This is "the default for recently-created avatars, so most Digital Twins and Studio Avatars qualify". Otherwise the call fails: "This video avatar does not support webm output."
   - Webm works on Avatar IV, Avatar V and Avatar III. It is "not available for Cinematic Avatar".
   - The adapter's `capabilities(profile)` reports alpha per profile, and only from an empirically verified WebM render: no look field reports matting. V1 does not pick its look for matting (§32, interpretation 4); the first prototype is MP4 and WebM is a later controlled experiment.
2. **Browser support.** Chrome, Edge and Firefox render VP9 alpha. Safari plays WebM but ignores its alpha, so the clip shows on black. Safari's alpha format is HEVC with alpha, which Chrome does not play (§31). So:
   - **Overlay** is offered only where alpha renders: the clip has alpha and the browser is not WebKit (Safari, or any iOS browser).
   - **Fallback (V1, every browser):** the opaque or alpha clip plays in a small rounded picture-in-picture frame anchored bottom-right. It needs no alpha. This is also what WebKit always gets.
   - **Deferred:** a chroma-key shader over a solid-colour background, and a server-side HEVC-alpha transcode for Safari. The transcode needs an encoder, and Workers run no ffmpeg (Motion V1 §32). Revisit either one only if AV1/AV5 show the PiP fallback is not good enough.
3. **Where the overlay lives.** It is a viewer-local layer, like skeleton slots: never saved, pushed, forked or counted as content. It never covers the focused or selected card. The persistent, shareable form of a clip is the video card (§13). The overlay starts only from the learner's click, has Close/Skip and captions, and under `prefers-reduced-motion` it appears without an entrance animation.
4. **Compositing.** Server-side compositing (§12, AV7) runs in the Linux render service's Chromium, which renders VP9 alpha. The Safari limit does not apply there.

---

# 12. Relationship to `/motion`

Avatar Teacher and `/motion` remain separate capabilities.

`/motion`:
- technical animation,
- code walkthrough,
- diagrams,
- matrices,
- system flows,
- mechanism explanations.

Avatar Teacher:
- human presence,
- greeting,
- transition,
- encouragement,
- explanation intro/outro,
- section handoff.

They can later be composed together.

Example future Motion storyboard:

```text
Beat 1
→ avatar teacher intro

Beat 2
→ Remotion / HyperFrames technical mechanism

Beat 3
→ avatar teacher takeaway
```

Final composition:

```text
transparent avatar clip
+
technical Motion composition
+
captions
+
audio
        ↓
Remotion compositor
        ↓
final video
```

Do not make Motion depend on Avatar Teacher for Motion V1.

Do not make Avatar Teacher depend on Motion.

They share media/storage/composition primitives where useful.

**Composition boundary:**
- **Shared, and only this:**
  - LearnVideos / `LEARN_MEDIA` storage;
  - the existing `type: "video"` block, told apart by `operation.op`. Motion's development carrier uses `motion_render` on `feature/motion-v1-harness` (unmerged); Avatar uses `avatar_clip` (§13);
  - the paid gate (`paidRefusal`).
- **Not shared:** briefs, Directors, review loops or schemas. A MotionBrief never contains an AvatarBrief, and the reverse never happens either.
- **Composition (AV7, development only).** It starts only after both Motion M7A (Remotion end to end) and AV4 (avatar storage) work.
  - A Motion storyboard beat may reference a **ready, cached** avatar clip by its render key.
  - The Motion orchestrator copies that clip into the render package as a deterministic asset before the sandboxed render. This is Motion V1 §16: the composition never fetches anything during render.
  - The avatar beat's script is written by the Avatar Director from the MotionBrief's own `claim_registry`. It may state nothing the brief does not.
  - Remotion, or HyperFrames (now Motion's priority second renderer on `feature/motion-v1-harness`), composites the alpha clip over the technical scene.
- **Cost.** A composed video is two paid jobs, each with its own confirmation: the avatar clip (unless it is already cached) and the Motion render. A single combined quote is Usage & Credits work (§15).
- **Ownership.** Motion owns the composed job and its provenance. The avatar clip keeps its own provenance and is listed as an input asset.
- No Motion code or Motion spec changes come from this document.

---

# 13. Existing Rabbit Hole video infrastructure

Reuse the existing video pipeline where possible.

Target:

```text
HeyGen output
→ download into Rabbit Hole-controlled storage
→ LEARN_MEDIA / existing LearnVideos path
→ existing video playback
```

Do not rely indefinitely on temporary/expiring provider URLs.

Prefer extending existing video metadata before inventing a new canvas block type.

Conceptual metadata:

```text
type: "video"

video_kind:
  "motion" | "avatar"

presentation:
  "card" | "transparent_overlay"
```

For an avatar clip embedded normally:
- use standard video card.

For transparent overlays:
- evaluate whether existing video rendering can support overlay presentation cleanly;
- only add a specialized UI primitive if existing video metadata is insufficient.

**Reconciled with the code on main:**
- **Path.** Clips go into `LEARN_MEDIA` and use the LearnVideos job pattern. A shared clip, though, lives in a scope Durable Object rather than in the learner's per-learner LearnVideos instance (§14).
- **No `video_kind` field.** Video blocks are already told apart by `operation.op`: `generate_video` (FAL) and `generate_math_animation` (Manim) on main (`learn-video.js:64-66`), and `motion_render` on the Motion branch. An avatar clip is:

  ```js
  insertBlock({
    type: 'video', mode: 'generate', title, src: '', caption: '', status: 'idle',
    operation: { op: 'avatar_clip', render_key, scope },        // nothing else: no script, no URL
    avatar_clip: { purpose, duration_seconds, presentation,      // provenance, server-checked
                   avatar_profile, voice_profile, engine, alpha, ai_generated: true },
  })
  ```

  `presentation: card | overlay` lives in `avatar_clip`, because no other video kind has it. The field is not named plain `avatar`: on main that word already means the user's profile picture (`user_profiles.avatar`, `packages/control-plane/src/profile.js:8-48`).
- **Content type.** LearnVideos assumes MP4 throughout:
  - the asset GET answers `Content-Type: video/mp4` (`learn-video.js:42`);
  - the storage key ends `.mp4` (`learn-video.js:117, 135`);
  - the R2 put sets `video/mp4` (`learn-video.js:118, 136`).

  AV4 stores the clip's real `contentType` (`video/webm` for alpha) on the job and serves that.
- **Copy.** `VideoBody` prints the FAL or Manim line under a pending clip (`LearningBlocks.jsx:1415-1421`). An avatar block gets its own line ("8 s · Teacher clip · AI-generated") and never FAL or Manim copy. This mirrors the Motion branch's `learn-video-label.js`.
- **Reload: a prerequisite for AV5** (owner decision 2026-10-04).
  - **The bug.** A paid video card saved mid-job never resumes after reload, share or fork. It is left with a permanent progress bar. The cause: `follow(placementId)` polls in memory only and never stores the id on the block (`LearningBlocks.jsx:1366-1389`; finding `paid-persist-8`, `docs/features/learn-cleanup.md:193`, deferred to unit U8).
  - **Fixed once, for everyone.** The fix lives in the shared video pipeline: the placement/job id is stored on the block and re-followed on mount. Motion, avatar clips and every other LearnVideos card benefit. There is no avatar-only playback state.
  - **If AV5 gets there first.** If no other branch has fixed it and the fix is small, it lands as its own prerequisite commit, separate from any avatar work, for Parallel to integrate and review on its own.
  - AV5 playback does not ship before that fix.
- **Disclosure.** Every avatar card and overlay is labelled AI-generated. HeyGen's Terms require commercial outputs to be disclosed as AI-made (§31).

---

# 14. Caching

Avatar generation should be cached aggressively when content is reusable.

Do not generate the same section greeting separately for every learner.

Conceptual cache key:

```text
hash(
  avatar_identity_or_look,
  voice_id,
  final_script,
  motion_direction,
  expressiveness,
  framing,
  output_format,
  provider_engine,
  provider_version_or_relevant_config
)
```

If cached:
- reuse existing Rabbit Hole-hosted artifact.

If not cached:
- generate,
- download,
- store,
- index cache key.

Highly personalized clips naturally have lower cache hit rates.

Do not accidentally include private learner text in cache keys or logs.

**Reconciled design: two keys and two scopes.**

1. **Script slot key.** The Director is a model. Keyed on `final_script` alone, two learners at the same moment would get two differently worded scripts, and so two paid renders. The script is therefore cached first:

   ```text
   script_key = sha256(brief_version, prompt_spec_version, scope, purpose,
                       current_concept, next_concept, from_concept,
                       source_refs (with commit), duration_seconds,
                       personalization, sorted session_concepts)
   ```

   The first validated and approved script for a slot is reused by everyone who reaches that slot. `learning_goal` and `visual_value` are never part of this key, or of the render key (§4.1).
2. **Render key.** This is the conceptual key above, with every provider-specific value resolved server-side:

   ```text
   render_key = sha256(script.text, provider, provider_avatar_id (look), provider_voice_id,
                       engine, alpha, aspect_ratio, resolution, framing, expressiveness,
                       motion_direction, captions, adapter version)
   ```

**Scopes.** LearnVideos is per learner: its Durable Object id is `idFromName([org, app, email])`, and "Cache and placements are private to this learner in this app/workspace" (`learn-video.js:26-27`). A greeting shared across learners cannot live there. So:

| Scope | Used when | Where the job and index live |
|---|---|---|
| `public_course`: **canonical product content** | `personalization: none` on the public `karpathy/nanoGPT` course at its pinned commit. Every V1 moment (§3). Generated by Rabbit Hole, never by or for a learner's payment. | one Durable Object instance per scope, `idFromName(["avatar", scope])`, with the LearnVideos pattern: `blockConcurrencyWhile`, one generating job, alarm polling, never resubmit. Learners only read from it. |
| `learner`: **personalized** (deferred) | learner-specific or explicitly requested personalized clips, and anything on a private course or repository. Paid from learner or account credits (§15). | the learner's own LearnVideos instance, unchanged |

- **Storage.** `LEARN_MEDIA` through `learnMedia(env)`, under the key `learn-avatar/<scope hash>/<render_key>.<webm|mp4>`. That bucket is `rabbit-hole-dev-learn-media` on development and `rabbit-hole-prod-learn-media` on production.
- **Playback.** An asset GET checks the viewer's access to the scope: any signed-in learner of the course for `public_course`, the owner only for `learner`. The canvas block holds only `operation.render_key` and `scope` (§13).
- **Reusable across learners:** only `public_course` clips. The script, the script slot and the clip contain no learner data by construction (§5.1).
- **Invalidation.** There is no TTL. A key changes when any input changes: a `prompt_spec_version` bump, a new course commit, an avatar or voice profile change, or an engine or adapter change.
  - Old objects are swept by a manual purge in development; production retention is decided at AV9.
  - Revoking an avatar's consent disables the profile and purges every clip made with it (§17).
  - A provider-side copy is deleted as soon as the clip is stored (§16).
- **Canonical clips are prepared by Rabbit Hole** (owner decision 2026-10-04).
  - **How.** Each canonical slot (moment × concept × course) is pre-generated once by Rabbit Hole as product content:
    - the Director writes its script;
    - the owner approves it;
    - an owner-run generation job renders it, after the §10 account prerequisites and an explicit spend approval.
  - **What learners get.** A reusable cached course asset. Learners never pay for one, and the Tutor offers a chip only once it is ready (§4.1).
  - **Prerequisites.** In development this needs the paid GO. In production it needs the AV9 GO.

---

# 15. Paid behavior

New avatar generation is a paid-generation capability.

Do not silently trigger provider generation on ordinary Tutor turns.

Policy:

```text
cached clip exists
→ may show/play immediately if product rules allow
  (V1 rule: shown as a chip, played only when the learner starts it; never autoplayed)

new generation required
→ proposal / explicit confirmation / credits flow
→ Generate
→ provider call
```

The current usage/credits system may not yet implement final quote/reserve/settle semantics.

Therefore production-paid generation remains deferred until the payment architecture is ready.

Development prototype generation can be separately approved.

**Paid-generation boundary, as built today.** There are two separate cases (owner decision 2026-10-04).

| | Canonical product clips (`public_course`, every V1 moment) | Personalized clips (`learner`, deferred) |
|---|---|---|
| Who pays | Rabbit Hole, once per slot, as product content | the learner or account, from credits |
| Who starts generation | the owner, through an owner-run job with an explicit spend approval (§14) | the learner, by choosing Generate on a proposal |
| What the learner sees | a chip that places the card; it plays when the learner presses Play, in Chat or Voice Mode | a proposal (script, duration, "This uses paid generation.", [Cancel] [Generate]), then a card |
| Canvas skeleton | none: the ready clip inserts at once | only after Generate (below) |
| Voice Mode | stays on; only playback pauses TTS and STT (§4.3) | stays on through proposal, Generate and the job; only playback pauses TTS and STT |

- **One gate for every provider.** Every avatar submission, from either case, runs `paidRefusal(body)` (`packages/control-plane/src/learn-paid.js`) in its Durable Object before the provider call. Without `confirmed: true`, which only an explicit Generate (the learner's, or the owner's for product content) sends, the answer is HTTP 428 `needsConfirm` (commit `2cb7f566`; `docs/features/learn-artifact-generation.md`, "Paid generation boundary"). AV3 adds an `/api/learn/avatar` row to that doc's gate table.
- **Cached means free, not automatic** (owner decision 2026-10-04).
  - A ready clip skips generation and payment.
  - It never autoplays, with or without sound, just because it exists. The learner explicitly starts it.
  - Muted visual previews are deferred.
  - The Director's script call costs Rabbit Hole a model call, never the learner.
- **No skeleton before commitment** (personalized path). A canvas skeleton means "we have committed to creating an artifact here" (`docs/features/canvas-skeleton-cards.md` on `ui/canvas-skeleton-cards`). So:
  - nothing appears on the canvas at the proposal;
  - Cancel shows nothing;
  - Generate reserves the slot and inserts the confirmed card (`confirmedStart`), which replaces the skeleton at once and shows its own in-card progress.
- **No automatic paid retries.** A failed or `uncertain` job's Retry asks for confirmation again, as `VideoBody` does today. There is one generating avatar job per Durable Object.
- **The first learner never pays for a shared clip.** That earlier option is dropped. A canonical moment that is not ready yet is simply not offered.
- **Usage & Credits** (quote → confirm → reserve → run → settle) is **not on main**. It is revision 3 on the unmerged `feature/usage-credits`, which prices a paid job as `max(1, ceil(max_cost_usd / 0.03))` credits against a 10-minute quote. Development needs only the confirmation gate. Production paid generation (AV9) waits for that branch.

---

# 16. Privacy

Never send unnecessary private context to HeyGen.

Do not send:
- learner voice transcript,
- raw private Tutor conversation,
- private repository source,
- entire canvas state,
- hidden learner evidence,
- OAuth/auth data,
- API keys,
- unrelated user metadata.

Send only:
- final generated script,
- necessary avatar/voice configuration,
- minimal provider metadata.

The Avatar Director may use Rabbit Hole context internally to write the script.

The provider receives the final script, not the reasoning/context corpus.

**Exactly what the provider receives** (the `renderInput` fields in §8):
- `script.text`;
- the provider avatar id and voice id;
- engine, alpha/format, resolution, aspect ratio and the captions flag;
- `title: "rh-avatar-<render key prefix>"`.

It never receives:
- an email, name, org, app, canvas or turn id;
- a `callback_id` that identifies a learner (because V1 polls, there is no callback URL at all);
- the Tutor's `learning_goal` or `visual_value` (§4.1).

**Further rules:**
- **The Director boundary is the guarantee.** The V1 script is built only from public course content and registry ids (§5.1). Even a leaked script reveals nothing about a learner.
- **Provider retention.** HeyGen's non-enterprise privacy policy and Terms allow it to use inputs "to train or otherwise improve" its models, with an opt-out by email; enterprise data is excluded by default (§31).
  - Before any real generation, the Rabbit Hole-owned HeyGen account opts out of training wherever the account allows it (an owner action, recorded; one of the §10 account prerequisites).
  - Once our copy is stored, the adapter calls `DELETE /v3/videos/{video_id}` ("Permanently deletes a video and its associated files").
  - HeyGen's DPA or enterprise terms are an AV9 legal-review item.
- **Logs.** One line per job state change:

  ```text
  {"event":"learn_avatar", kind, render_key_prefix, scope_kind, purpose, provider, engine, status, ms, cache_hit}
  ```

  It carries no script text, as Voice logs no text (`voice-tutor-mvp.md`, `learn_voice`), and no provider bodies.
- **MCP sessions** (§10) use fixture scripts only.

---

# 17. Likeness / consent

Avatar identity must have a valid consent basis.

V1 should prefer:
- provider stock/licensed avatars, or
- a Rabbit Hole-owned Digital Twin created with explicit consent.

Do not clone/use a real person's likeness without the consent process required by the provider and applicable policy/law.

Store provenance for:
- avatar profile used,
- consent/ownership status where relevant,
- voice profile,
- provider.

Do not expose sensitive consent metadata to ordinary learners.

**Provider requirements (HeyGen, read 2026-10-04, §31):**
- **What needs consent.**
  - A digital twin needs proof of consent. Level 1 is a webcam statement on HeyGen's hosted page (`POST /v3/avatars/{group_id}/consent`, a link valid for 24 hours). Levels 2 and 3 are Enterprise only.
  - Photo avatars carry no HeyGen consent record: "keeping your own record of it is your responsibility".
- **What is banned.**
  - HeyGen's moderation policy bans avatars that "Represent real individuals, including celebrities or public figures, without their explicit consent", and anyone appearing under 18.
  - Its Terms ban impersonation and require AI-made commercial output to be disclosed.

**V1 policy:**
- **V1 face: a HeyGen stock/licensed avatar only** (owner decision 2026-10-04). There is no Rabbit Hole digital twin yet. This:
  - avoids a likeness-consent workflow for our own twin;
  - speeds up the prototype;
  - lets the owner judge the interaction before choosing a permanent teacher identity.
- **A digital twin later** is a brand/identity decision, not a V1 one. If it is ever made:
  - Rabbit Hole owns the HeyGen account;
  - consent is documented through HeyGen's own consent flow;
  - provider terms are followed;
  - no one's likeness is used casually.

  Avatar V (digital twins only, §9) becomes available only then.
- **Not allowed:** photo avatars of real people, learner-created avatars, voice clones of anyone, and celebrity or third-party likeness.
- **Profile registry.** Each avatar and voice profile is one server-side record:

  ```text
  { profile_id, provider, provider_ref, kind: stock (V1) | owned_twin (later), consent_basis,
    consent_record_ref (private; twins only), granted_at, revoked_at? }
  ```

  It lives in server configuration, never in a block or brief. Learners see only "AI-generated teacher".
- **Revocation.** Revoking consent, or withdrawing a stock avatar's licence, disables the profile at once, removes its clips from R2 and from HeyGen, and makes every later cache lookup miss (§14).
- **Disclosure.** Every clip is labelled AI-generated (§13).
- **Fish voice (later comparison only, §18).** Using the Voice Tutor's pinned Fish narrator (`reference_id 802e3bc2…`) as the avatar's audio needs the Fish voice's licence to permit distributed avatar video. That is already a Motion V1 §34 release item.

---

# 18. Voice selection

The avatar voice and the normal Rabbit Hole Tutor TTS voice may be the same or intentionally different.

Evaluate both.

Potential goals:
- consistent "professor" identity,
- natural lip sync,
- stable pronunciation of technical terms,
- calm teacher delivery.

Technical words and names should be tested explicitly.

If provider-native voice performs poorly on technical language, investigate:
- pronunciation dictionaries if supported,
- alternate voice profile,
- supplied audio workflows,
- pre-generated narration.

Do not solve this before prototype evidence exists.

**V1 voice: HeyGen's native provider voice** (owner decision 2026-10-04). The first prototypes and the V1 baseline use a HeyGen voice. Fish plus HeyGen is **not** the baseline: a native voice means one provider call, less latency, lower cost and simpler lip-sync.

**Priority later comparison: Fish-supplied audio.** It is run if any one of these holds, and only if the Fish licence permits Fish audio in distributed avatar video (§17):
- HeyGen's pronunciation of technical terms is poor;
- the owner strongly wants the Voice Tutor's professor voice.

What HeyGen offers, per its docs on 2026-10-04 (§31):
- **Pronunciation:** a Brand Glossary of respellings ("`hey-jen`"; no IPA or phonemes), passed as `brand_glossary_id`.
- **Pauses:** `<break>` tags only.
- **Your own audio:** `audio_url` or `audio_asset_id` (MP3/WAV, up to 32 MB), which are "mutually exclusive with `script`". This is the mechanism for the later Fish comparison.
  - In that case the provider receives audio of the same script, which is no extra private data.
  - The Fish call would be a second paid call under the same approval.
  - Whether WebM alpha works with `audio_url` is UNVERIFIED.

---

# 19. UX

Avatar clips should not unexpectedly hijack the learning experience.

Guidelines:
- short,
- skippable,
- no autoplay with sound unless current product policy explicitly allows it (it does not: paid narration "never autoplays", `docs/features/learn-artifact-generation.md`. Owner decision 2026-10-04: a cached clip never autoplays just because it exists; the learner explicitly starts it, and muted previews are deferred),
- Voice Mode does not suppress suggestions; while a clip plays, Tutor TTS and STT pause, and they resume when it ends or stops; the two audio sources never overlap (§4.3),
- subtitles/captions when appropriate,
- no excessive frequency,
- no giant talking head obscuring the learning canvas,
- learner can continue without waiting when possible.

For transparent overlay:
- avoid covering active cards,
- respect reduced motion/accessibility,
- provide close/skip when appropriate.

---

# 20. Suggested Tutor policy

Conceptual policy:

```text
if ordinary_question:
    text/card response

if major_section_boundary:
    avatar clip may be suggested

if learner explicitly requests teacher/avatar:
    avatar clip may be proposed

if clip already cached and product allows:
    play/show

if new paid generation required:
    show proposal
    require confirmation
```

Tutor decides pedagogical intent, not provider execution.

In V1 (owner decisions 2026-10-04):
- A suggestion is a chip (§4.1), surfaced only after the six-question trigger validator. Chat and Voice suggest the same way.
- A cached clip plays only when the learner starts it; it never autoplays.
- "Show proposal" belongs to the deferred personalized path (§15).

---

# 21. Development prototype set

Prototype at least four clips.

These four are canonical product moments (§3, §14). Once approved, they are the first clips Rabbit Hole generates as reusable course assets.

## A. Course greeting

Purpose:
`orientation` (section greeting)

Example goal:
"Welcome the learner to Attention and explain what question the section answers."

Target:
~6–10 seconds.

## B. Section transition

Purpose:
`transition`

Example:
"Next, let's look at softmax and how it turns scores into weights."

Target:
~5–8 seconds.

## C. Rabbit Hole return

Purpose:
`rabbit_hole_return`

Example:
"Now connect what you learned about softmax back to causal attention."

Target:
~5–8 seconds.

## D. Completion

Purpose:
`completion`

Example:
"You've finished this section. Next, try explaining how causal masking and softmax work together."

Target:
~6–10 seconds.

Compare where available:
- Avatar V: not in V1. It is documented for digital twins only, and V1 uses a stock/licensed avatar (§17). It comes back with a twin, if one is ever made.
- Avatar IV, the V1 engine for the stock look (or whatever that look's `supported_api_engines` lists),
- opaque MP4,
- transparent WebM, a separate controlled experiment after MP4 succeeds (§32, interpretation 4),
- voice: HeyGen's native voice is the V1 baseline. The Fish narrator through `audio_url` is a priority later comparison under the §18 conditions, not part of the first prototypes.

Evaluate:
- lip sync,
- body movement,
- facial naturalness,
- teacher tone,
- technical pronunciation,
- render latency,
- provider reliability,
- output resolution,
- alpha compositing quality,
- cost.

---

# 22. Quality review

Evaluate each prototype on two independent axes.

## Human-presence / visual quality

- natural lip sync,
- facial motion,
- body motion,
- eye contact,
- framing,
- hand/gesture quality,
- no uncanny movement,
- clean alpha edges for transparent output,
- no visual artifacts.

## Pedagogical quality

- script is correct,
- matches learner context,
- does not overstate mastery,
- gives a useful transition,
- is concise,
- no unsupported claims,
- does not distract from the next learning task.

Do not accept a visually impressive clip that teaches the wrong thing.

---

# 23. Observability

Use provider-neutral events/metadata.

Suggested safe metadata:
- avatar_job_id,
- purpose,
- provider,
- engine family,
- duration,
- cache_hit,
- generation latency,
- success/failure category,
- Rabbit Hole release SHA.

Do not log:
- raw private learner content,
- transcripts,
- auth data,
- provider secrets.

Sentry/PostHog integration can be added when those systems are canonical.

This feature should not depend on either observability vendor.

---

# 24. Failure behavior

Provider failure must not block learning.

If avatar generation fails:
- show a safe error or fall back to text,
- never lose the Tutor turn,
- never mutate learner state incorrectly,
- no repeated automatic paid retries.

Timeout:
- fail cleanly,
- allow retry with learner confirmation if paid.

Unsupported avatar capability:
- downgrade engine/output format where allowed,
- otherwise report unsupported configuration.

The error categories are in §8. Each maps to one short learner message. The Tutor's text answer and the canvas are untouched.

---

# 25. Live Avatar — deferred

HeyGen Live Avatar / realtime conversational teacher is a separate future capability.

Do not implement in Avatar Teacher V1.

Potential future architecture:

```text
Tutor state
↔ realtime avatar session
↔ learner audio
```

This would have substantially different:
- latency,
- session lifecycle,
- privacy,
- interruption,
- billing,
- realtime transport,
- moderation,
- concurrency.

Treat it as a separate milestone.

---

# 26. Milestones

## AV0 — provider research/spec

- HeyGen capabilities,
- Avatar IV/V,
- transparent output,
- voice options,
- consent constraints,
- API contract,
- MCP development workflow.

**Status: accepted by the owner (2026-10-04).** Every later milestone is development only, and each has its own GO (§32).

## AV1 — MCP prototypes

Using HeyGen MCP in development only:
- generate prototype A–D,
- compare quality,
- inspect transparent output,
- record cost/latency.

No Rabbit Hole production integration.

Paid: MCP spends the HeyGen web plan's credits (§10).
- **Prerequisites.** All §10 account prerequisites, plus the owner's explicit spend approval: a Rabbit Hole-owned account and credentials, training disabled, a credit ceiling, and no personal-account dependency.
- **Inputs.** A stock/licensed avatar, a HeyGen native voice, fixture scripts only.
- **Report.** The §22 review per clip, latency, credits, and alpha edges in Chrome and in Safari.

**Not yet authorized.**

## AV2 — AvatarBrief + Avatar Director

Implement:
- schema,
- script generation,
- source grounding,
- Tutor-purpose mapping.

No provider call required initially.

It also includes:
- the §5.1 boundary;
- the fresh script reviewer and one repair;
- the script-slot cache (§14);
- tests against recorded model responses: a forbidden input never reaches the prompt, a mastery claim is blocked, and the second request for a slot makes no model call.

**Authorized now: AV2 groundwork, with no paid calls.**
- The AvatarBrief schema (§6) and its validator.
- The Avatar Director contract (§5.1): input boundary, output schema, validation and script-slot key, tested against recorded fixtures with no live model call.
- The Tutor `suggest_avatar_clip` schema and validator (§4.1), including the bounded `learning_goal`, the internal `visual_value` and the trigger validator, behind `TUTOR_AVATAR`, which stays off. With the knob off, the planner request is byte-identical to today.

Live Director model calls, and switching the Tutor action on, wait for later GOs (§32).

## AV3 — provider adapter

Implement:
- AvatarProvider,
- HeyGenAvatarProvider,
- submit/poll/download,
- normalized error handling.

Dev only.

- It is v3 only (§9), env-gated (`LEARN_AVATAR_PROVIDER`, `HEYGEN_API_KEY`), and built under `paidRefusal`.
- Tests use a stubbed transport: unconfirmed is 428 with no call, a lost response becomes `uncertain`, there is no resubmission, the host and content type are checked, and every error category is covered.

**Authorized now: AV3 groundwork.** The AvatarProvider interface (§8) and the HeyGen v3 adapter against a **test stub only**. No `HEYGEN_API_KEY` is set anywhere. The first real HeyGen REST call needs the §10 account prerequisites and the owner's explicit spend approval.

## AV4 — storage/cache

- download result,
- LEARN_MEDIA,
- LearnVideos/video metadata,
- deterministic cache.

As reconciled in §13–§14:
- the render key;
- the shared `public_course` Durable Object next to the per-learner LearnVideos;
- the `learn-avatar/…` R2 keys;
- the real `contentType` (WebM);
- scope-checked asset GET.

Test: a second request for a ready key makes no provider call, and two concurrent misses submit once.

**Authorized now: AV4 groundwork.** The storage and cache contracts:
- the script-slot and render keys;
- the two scopes (canonical `public_course` content, personalized `learner`);
- the R2 key scheme and content type;
- the scope-checked asset GET;
- the ready-clip lookup the Tutor's resource stage uses.

All tested against stubs. No real generation and no deploy.

## AV5 — canvas playback

- normal avatar video card,
- optional transparent overlay prototype,
- captions/skip/accessibility.

It also includes:
- the `operation.op: avatar_clip` card with its own copy and the AI-generated label;
- playback only on the learner's explicit start (no autoplay; muted previews deferred);
- the PiP fallback and WebKit detection (§11);
- the build deployed to the implementation worktree's own dev clone for visual review (`rabbit-hole-web-dev-avatar-teacher-v1`, from the `avatar-teacher-v1` worktree), never the shared dev Worker.

**Prerequisite:** the shared video resume-after-reload fix (`paid-persist-8`, §13). It is fixed once in the shared pipeline, or, if AV5 gets there first, landed as its own separate prerequisite commit for Parallel to review. It is never avatar-only state.

**Not yet authorized** (it deploys).

**AV5/AV6 acceptance (Voice audio, §4.3):**
- (4) clip playback pauses Tutor TTS;
- (5) playback pauses the mic/STT;
- (6) stopping or ending the clip restores Voice listening;
- (7) Voice and avatar audio never overlap.

## AV6 — Tutor suggestion flow

Tutor:
- recognizes approved moments,
- emits provider-independent `suggest_avatar_clip`,
- never silently spends money.

The action contract, router rows, validator stages and chip are in §4.1.
- The schema lands in AV2 groundwork behind the off-by-default `TUTOR_AVATAR` knob. Golden-trace tests check that typed and voice turns are byte-identical while the knob is off.
- AV6 is the integration: chip execution, ready canonical clips, and the knob turned on.
- **Not yet authorized:** it needs the owner's GO and a Tutor benchmark re-run.

## AV7 — Motion composition prototype

Combine:
- avatar intro,
- Motion technical segment,
- avatar takeaway.

Still dev only.

It starts after Motion M7A and AV4, under the §12 boundary, with the cached clip as a deterministic asset. Any change it needs on the Motion side goes through the Motion branch's owner. **Not yet authorized.**

## AV8 — quality/cost benchmark

Compare:
- Avatar IV,
- Avatar V,
- transparent/opaque,
- cache behavior,
- latency/cost,
- visual/pedagogical quality.

In V1, Avatar V is out of scope until a digital twin exists (§17). The benchmark adds:
- Avatar III as a cost reference;
- the priority Fish-supplied-audio comparison, under the §18 conditions and Fish licensing.

Paid: it needs the §10 prerequisites and its own spend approval.

## AV9 — production rollout

Deferred until:
- payment/credits are ready,
- provider/privacy review complete,
- avatar consent/legal review complete,
- cost limits set,
- production acceptance tests pass.

It also waits for:
- `feature/usage-credits` merged;
- a HeyGen DPA or enterprise review, including training exclusion;
- an AI-disclosure legal check;
- a production retention policy for `learn-avatar/` objects;
- the owner's production GO for `HEYGEN_API_KEY` on `rabbit-hole-app` (digrabbithole.com).

---

# 27. Acceptance criteria for development V1

A successful Avatar Teacher development prototype demonstrates:

1. one structured AvatarBrief,
2. grounded 1–2 sentence script,
3. HeyGen generation succeeds,
4. output is downloaded into Rabbit Hole-controlled storage,
5. normal video playback works,
6. transparent WebM works for at least one eligible avatar if supported, and WebKit gets the PiP fallback,
7. cache hit avoids duplicate provider generation,
8. no unnecessary private learner context leaves Rabbit Hole,
9. provider failure does not block learning,
10. Tutor remains provider-independent,
11. no silent paid generation,
12. one Motion + avatar composition prototype works,
13. provenance identifies provider/avatar/voice/config used,
14. canonical moments are free to learners, and never autoplay, in Chat or in Voice Mode,
15. the owner correction's acceptance tests, numbered as the owner gave them:
    1. Voice Mode ON does not suppress `suggest_avatar_clip`;
    2. Chat and Voice can produce the same pedagogical suggestion;
    3. an ordinary Voice response does not automatically produce avatar material;
    4. clip playback pauses Tutor TTS;
    5. playback pauses the mic/STT;
    6. stopping or ending the clip restores Voice listening;
    7. Voice and avatar audio never overlap;
    8. a cached clip can be suggested during Voice Mode;
    9. an uncached paid clip still requires Generate confirmation;
    10. `visual_value` stays internal and is never sent to HeyGen.

    Tests 1, 2, 3 (validator level), 8, 9 (contract level) and 10 are unit tests in the AV2–AV4 groundwork. Tests 4–7 are AV5/AV6 acceptance tests.

---

# 28. Explicitly out of scope for V1

- realtime Live Avatar,
- avatar on every Tutor turn,
- automatic paid generation,
- unrestricted learner-created celebrity/person likenesses,
- unconsented voice/likeness cloning,
- full collaborative avatar editing,
- arbitrary third-party avatar providers,
- replacing normal Voice Tutor,
- replacing `/motion`,
- autonomous long-form lectures.

---

# 29. Architectural principle

Rabbit Hole should treat the avatar as a **teaching primitive**, not a provider feature.

The long-term system is:

```text
Learner context
        ↓
Tutor pedagogical decision
        ↓
Teaching primitive

├── text
├── canvas card
├── /motion
└── avatar teacher

        ↓

provider/runtime chosen behind an adapter
```

For avatar moments:

```text
Tutor
→ suggest_avatar_clip
→ Avatar Director
→ grounded script
→ AvatarProvider
→ HeyGen
→ Rabbit Hole storage
→ canvas/video/overlay
```

This preserves:
- pedagogy above providers,
- provider replaceability,
- learner privacy,
- reusable artifacts,
- Motion composability,
- explicit paid-generation control.

---

# 30. Conflicts reconciled (2026-10-04, main `74d20468`)

Each row is a conflict, inconsistency or wrong assumption found in the owner's draft when it was checked against the code and docs, and what this document now says.

| # | Found | Evidence | Resolution |
|---|---|---|---|
| 1 | The Tutor has no generation action and no paid tools. `generate_artifact`, `suggest_motion` and the paid-tool UX are an open decision. The planner prompt says "never generate new artifacts". | `tutor-v1-locked-decisions.md:206, 249, 260, 496-503, 553`; `agents/learn-tutor.js:176` | `suggest_avatar_clip` (renamed from `show_avatar_message`, owner 2026-10-04) is a chip-only suggestion behind the off-by-default `TUTOR_AVATAR` knob. In V1 it leads only to free, pre-generated canonical clips, so the open paid-tool item stays open (§4.1). |
| 2 | The action field `purpose` collides with the planner tool's existing `purpose` enum for `ask_question`. | `agents/learn-tutor.js:154` | The Tutor field is `moment`; the brief keeps `purpose` (§4.1). |
| 3 | Purposes assume section and course-completion state that the Tutor does not have. | `learn-tutor-evidence.js:1-23` (session-only store); `learn-tutor.js:144-177` (router rows) | Each moment is mapped to a real signal (§3 table, revised by the owner correction); `completion` and the section-entry greeting have no Tutor trigger in V1. |
| 4 | `content_goal` and `context_refs` are free text from the planner: a path for learner words into the Director and provider, and a cache breaker. | §4 draft vs §16 draft | `context_refs` dropped: registry concept ids only. `content_goal` kept by owner decision and later renamed `learning_goal`, but bounded: ≤ 120 characters; a Director hint only; never sent to the provider, logged or used in a key; dropped if it carries code, identifiers or five consecutive words of the learner's message. Canonical moments ignore it, so it has no V1 effect (§4.1). |
| 5 | `completed_topics`, and the examples "you've got causal masking" and "You can now explain…", are mastery claims. | `agents/learn-tutor.js:181`; `adaptive-tutor-v1.md:43` (T1) | Concept ids plus a `personalization` switch, `no_mastery_claims`, and the examples rewritten (§2, §6, §7, §21). |
| 6 | Opus 5.5 rejects a forced `tool_choice`, and the artifact path forces `any`. | `agents/learn-tutor.js:215-217`; `learn-artifact.js:53`; Motion V1 §4.9 | The Director uses `auto`, harness validation and one schema re-ask; the planner stays `auto` (§4.1, §5.1). |
| 7 | The cache key uses `final_script`, but the Director is a model, so two learners would get two scripts and two paid renders. | §14 draft | A script-slot key comes first, then the render key (§14). |
| 8 | Sharing a greeting across learners conflicts with LearnVideos, which is per learner. | `learn-video.js:26-27` | A `public_course` scope Durable Object, alongside the unchanged per-learner LearnVideos (§14). |
| 9 | The draft assumes video metadata `video_kind: motion \| avatar`; the code tells video blocks apart by `operation.op`. | `learn-video.js:64-66`; `motion_render` on `feature/motion-v1-harness` | `operation.op: avatar_clip` plus an `avatar_clip` provenance object (§13). |
| 10 | LearnVideos hard-codes MP4, so WebM alpha would be served as `video/mp4`. | `learn-video.js:42, 117-118, 135-136` | The job stores its real `contentType` (§13, AV4). |
| 11 | The draft's provider method list duplicates an existing contract. | `video-provider.js:1-8`; `math-provider.js`; Motion V1 §18 | Reuse `submit → ticket`, `poll → null \| result`; the job runner owns download and storage (§8). |
| 12 | A paid video card never resumes after reload. | `LearningBlocks.jsx:1366-1389`; `learn-cleanup.md:193` (`paid-persist-8`) | A prerequisite for AV5, fixed once in the shared video pipeline, or landed as its own separate prerequisite commit for Parallel. No avatar-only state (§13, owner 2026-10-04). |
| 13 | "Cached clip → may play immediately" conflicts with the no-autoplay rule and with the Tutor's chip authority. | `learn-artifact-generation.md:102-104`; `tutor-v1-locked-decisions.md:255-266` | Chip only. Cached means no generation or payment, never automatic playback: the learner explicitly starts it. Muted previews are deferred (§4.1, §15, §19, §20; owner 2026-10-04). |
| 14 | The draft is silent on canvas skeletons for paid work. | `canvas-skeleton-cards.md:7, 41-54` on `ui/canvas-skeleton-cards` | No skeleton at the chip or proposal; Generate reserves the slot (§15). |
| 15 | The draft's "credits flow" does not exist on main. | `feature/usage-credits` (revision 3, unmerged); `learn-paid.js` | Development uses the confirmation gate only; production waits for Usage & Credits (§15, AV9). |
| 16 | "Production deferred" had no mechanism, yet production reuses every development route. | `rabbit-hole-production.md`, "Production entry" (`app-worker.js` reuses `dev-worker.js`) | An env-gated provider; no key on `rabbit-hole-app` before AV9 (§8, §9). |
| 17 | HeyGen v1 and v2 (including `/v2/video/generate` and `/v1/video.webm`) sunset on 2026-10-31. | §31 | v3 only (§9). |
| 18 | The draft treated MCP as free exploration; it spends HeyGen plan credits. | §31 | AV1 needs a paid GO with a ceiling (§10). |
| 19 | Avatar V is documented for digital twins only, so stock avatars cannot use it. | §31 | The V1 face is a HeyGen stock/licensed avatar on its supported engine (Avatar IV today). Avatar V waits for a possible later twin (§9, §17, §21; owner 2026-10-04). |
| 20 | Safari ignores WebM alpha. | §31 | PiP fallback, with the overlay off on WebKit (§11). |
| 21 | Body motion is not a general control: `motion_prompt` is documented for photo avatars only. | §31 | `motion_direction` is optional and used only where supported (§6). |
| 22 | The Learner Intent Resolver is the shared input for specialists, but V1 avatar clips are learner-agnostic. | `adaptive-tutor-v1.md:502-664` | The V1 Director takes no LearnerTurn: the Tutor, which reads the turn, picks the moment. Personalized clips will consume the Resolver's bounded LearnerTurn (pointer added there). |
| 23 | "Avatar" already means the profile picture in code. | `profile.js:8-48`; `learn-migrations/0002-user-profiles.sql:7` | Identifiers are `suggest_avatar_clip`, `avatar_clip`, `learn-avatar/` and `AvatarBrief`. `/api/profile` is untouched. |
| 24 | An early product plan lists "Talking-head avatar" as a v1 non-goal. | `docs/02-how-we-will-build-it (1).md:15, 115` | Historical. This spec governs the avatar teacher; that file is not edited. |
| 25 | Stale bucket names in other docs, not edited here: Motion V1 §32 names `small-learn-media-dev`, and the storage table says production has no `LEARN_MEDIA`. | `rabbit-hole-motion-v1-harness-spec.md` §32; `learn-artifact-generation.md:163-164` vs `packages/web/wrangler.dev.jsonc:77-79` (`rabbit-hole-dev-learn-media`) and `wrangler.rabbit-hole-prod.jsonc:38` (`rabbit-hole-prod-learn-media`) | This spec uses the real bucket names. The other docs are left for their owners. |
| 26 | New names were needed. | `CLAUDE.md:34` (`rabbit-hole-*`, never `small-*`) | No new Cloudflare or Fly resource. New names: secret `HEYGEN_API_KEY` and var `LEARN_AVATAR_PROVIDER` (none exists today), R2 prefix `learn-avatar/`, dev clone `rabbit-hole-web-dev-avatar-teacher-v1` (the implementation worktree, §33). |
| 27 | The first reconciliation let "the first learner who confirms" pay for a shared clip. | §15 (f639a825) | Dropped. Canonical moments are pre-generated by Rabbit Hole as reusable course assets, and learners never pay for them. Only deferred personalized clips are learner-paid. The two cases are kept apart in §3, §14, §15 and §26 (owner 2026-10-04). |
| 28 | The first reconciliation's chip could open a paid proposal when no clip was cached. | §4.1 (f639a825) | The chip is offered only when the canonical clip is ready. The proposal → Generate path belongs to deferred personalized clips (§4.1, §15). |
| 29 | Voice turns: the first pass only blocked suggestions, with no answer for an explicit request. | §4.1 (f639a825) | Superseded by row 32: Voice Mode no longer suppresses suggestions. |
| 30 | Voice: the first pass compared HeyGen and Fish as equals. | §18, §21 (f639a825) | HeyGen's native voice is the V1 baseline. Fish-supplied audio is a priority later comparison, under stated conditions and Fish licensing (§18; owner 2026-10-04). |
| 31 | Account: the first pass mentioned a Rabbit Hole account only for MCP. | §10 (f639a825) | Five account prerequisites, plus explicit spend approval, before any paid MCP or API call (§10; owner 2026-10-04). |
| 32 | Locked decision 6 (no suggestions in Voice Mode) mixed up a communication mode with a learning material. | owner correction 2026-10-04 | Voice and Chat are modes; clips are materials. Voice never suppresses `suggest_avatar_clip`; only playback pauses TTS and STT (§3, §4.1, §4.3). |
| 33 | The action had calendar-like purposes and no pedagogical test. | owner correction | Nine moments with a canonical/personalized mapping (§3), a required internal `visual_value` and the six-question trigger validator (§4.1). |
| 34 | `content_goal` vs the owner's `learning_goal`. | owner correction | Renamed. Same bounds and drop rules; Director-only; never in a key, a log or a provider request (§4.1). |
| 35 | The owner's example action has no `concept`, but the canonical key needs one. | §14 | `concept` (and `to_concept`) kept in the contract (§4.1). |
| 36 | The first reconciliation's chip "plays from the click". | §4.1 (9ea577df) | The chip places the card; Play is a separate press of the learner. A clip never autoplays, in Voice Mode either (§4.1). |

---

# 31. Research snapshot: HeyGen (read 2026-10-04)

Public documentation only. No key, no account call and no MCP session was used. `docs.heygen.com` now redirects to `developers.heygen.com`. Prices and limits change, so re-check them at AV1 and AV3.

| Topic | Finding | Source |
|---|---|---|
| API version | v3 is current: "v3 is live and recommended for all new development". v1 and v2 "sunset on October 31, 2026". Mapping: `/v2/video/generate` → `POST /v3/videos`; `/v1/video_status.get`, `/v2/videos/{id}` → `GET /v3/videos/{id}`. | https://developers.heygen.com/docs/quick-start, https://developers.heygen.com/changelog, https://developers.heygen.com/endpoint-version-comparison.md |
| Create | `POST https://api.heygen.com/v3/videos`, header `X-Api-Key`. `type: avatar \| image \| cinematic_avatar \| studio`. Avatar fields: `avatar_id`; `script` + `voice_id`, or `audio_url` / `audio_asset_id`; `engine.type: avatar_v \| avatar_iv (default) \| avatar_iii`; `output_format: mp4 \| webm`; `resolution: 4k \| 1080p \| 720p`; `aspect_ratio: 16:9 \| 9:16 \| 4:5 \| 5:4 \| 1:1 \| auto`; `background`, `remove_background`, `caption`, `title`, `callback_url`, `callback_id`; `motion_prompt` (photo avatars). Optional `Idempotency-Key` header ("replays response within 24 hours"). Response `data.video_id`. | https://developers.heygen.com/reference/create-video |
| Status | `GET /v3/videos/{video_id}` → `pending \| processing \| completed \| failed`, with `video_url`, `captioned_video_url`, `subtitle_url`, `duration`, `failure_code`, `failure_message`. The create response shows `"waiting"`, which the status list does not include. | https://developers.heygen.com/reference/get-video |
| Engines | **Avatar IV** is the v3 default (studio avatar, digital twin, photo avatar, image, prompt). **Avatar V** is the "highest-fidelity", for `digital_twin` only; eligibility is `supported_api_engines` on `GET /v3/avatars/looks/{look_id}`. **Avatar III** is the cheaper photo-to-video pipeline. Cinematic Avatar makes 4–15 s prompt-driven clips. | https://developers.heygen.com/avatar-iv, https://developers.heygen.com/avatar-v, https://developers.heygen.com/avatar-iii.md |
| Avatars | "500+ stock avatars" (groups → looks): `GET /v3/avatars`, `/v3/avatars/looks`. A digital twin is created with `POST /v3/avatars` from 15–600 s of footage. | https://developers.heygen.com/docs/avatars.md, https://developers.heygen.com/docs/avatar-from-video.md |
| Voices | `GET /v3/voices`; cloning with `POST /v3/voices/clone`; TTS `POST /v3/voices/speech` (1–5,000 characters, `<break>` only); pronunciation via a Brand Glossary of respellings (`brand_glossary_id`); own audio via `audio_url` / `audio_asset_id` (MP3/WAV ≤ 32 MB, exclusive with `script`). | https://developers.heygen.com/reference/list-voices.md, https://developers.heygen.com/docs/voices/speech.md, https://developers.heygen.com/docs/brand-glossary.md, https://developers.heygen.com/audio-to-video.md |
| Limits | Script ≤ 5,000 characters; 25 fps avatar video; 128–4,096 px, default 1080p. "4K rendering for Avatar IV & V … temporarily unavailable" (July 2026). Pay-as-you-go: 10 concurrent renders; Enterprise: 20 plus burst; over the limit, 429 with `Retry-After`. | https://developers.heygen.com/docs/usage-limits, https://developers.heygen.com/changelog |
| Transparency | `output_format: "webm"` "Returns a WebM file with a real alpha channel", removes the background itself, and rejects `background`. It needs a look "trained with matting (… most Digital Twins and Studio Avatars qualify)"; otherwise: "This video avatar does not support webm output." Works with Avatar IV, V and III; "not available for Cinematic Avatar". | https://developers.heygen.com/transparent-background-videos |
| Webhooks | `POST /v3/webhooks/endpoints` returns a secret once. The `signature` header is a hex HMAC-SHA256 of the raw body. A 2xx is required within 10 s, and retries run up to 24 h. Events include `avatar_video.success` and `avatar_video.fail`. | https://developers.heygen.com/docs/webhooks, https://developers.heygen.com/docs/webhook-events.md |
| Output URLs | Presigned, with a "limited expiry window": "Fetch and store the file promptly". | https://developers.heygen.com/docs/webhook-events.md, https://developers.heygen.com/video-details |
| Deletion | `DELETE /v3/videos/{video_id}`: "Permanently deletes a video and its associated files." | https://developers.heygen.com/reference/delete-video.md |
| Pricing | **Corrected 2026-10-04 (owner review of the current public API pricing):** charged by actual generated seconds. Avatar IV: Photo Avatar $2.31/min, Digital Twin $4.83/min, Studio Avatar $4.83/min. Avatar V: Digital Twin $7.20/min. The earlier "0.1 credit/s, about $0.05/s" figure is the enterprise credit rate and is not used for estimates. The rate that applies depends on the avatar type the API reports for the chosen look (§33). The pay-as-you-go wallet is "separate from our regular HeyGen plans" and starts at $5. | owner review 2026-10-04 (the live page, `heygen.com/api-pricing` → `app.heygen.com/developers/api?modal=pricing`, renders by JavaScript and could not be re-read here); https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained |
| MCP | Official remote server `https://mcp.heygen.com/mcp/v1/`, with OAuth ("no API key"). "Usage draws on your existing HeyGen plan's credits." About 90 tools, including `create_video`, `get_video`, `delete_video`, `list_avatar_groups`, `list_avatar_looks`, `get_avatar_look`, `list_voices`, `create_avatar_consent` and `create_video_agent`. Claude Code: `claude mcp add --transport http heygen https://mcp.heygen.com/mcp/v1/` (optionally `-s user`), then `/mcp` for OAuth. The old local `heygen-com/heygen-mcp` repository returns 404. | https://developers.heygen.com/mcp/overview, https://developers.heygen.com/mcp/claude-code.md |
| Consent | "Digital twins require proof of consent; photo and prompt avatars do not." Level 1 is a webcam statement (all customers); Levels 2 and 3 are Enterprise. `POST /v3/avatars/{group_id}/consent` returns a link valid for 24 h. Photo avatars: "keeping your own record of it is your responsibility". The moderation policy bans real individuals "without their explicit consent" and minors. The Terms ban impersonation and require AI disclosure of commercial output. | https://developers.heygen.com/docs/avatar-consent.md, https://developers.heygen.com/docs/avatar-from-photo.md, https://www.heygen.com/moderation-policy, https://www.heygen.com/terms |
| Privacy | Non-enterprise inputs may be used to "train and enhance the models"; the opt-out is by email. Enterprise data is excluded by default. Backups of deleted accounts are kept 60 days. Data is stored in the US on AWS. SOC 2 Type II. Biometric data is destroyed within 60 days of an avatar's deactivation. An older ethics page (2023) says consent-based training and disagrees with this. | https://www.heygen.com/privacy, https://www.heygen.com/security, https://www.heygen.com/biometric-privacy-notice, https://www.heygen.com/ethics |
| HyperFrames | HeyGen's open-source HTML-to-video renderer (Apache-2.0, headless Chrome + FFmpeg), plus a hosted `POST /v3/hyperframes/renders` (webm/mov with alpha). It is a separate compositing layer, not the avatar renderer. Motion owns any HyperFrames work (its priority second renderer on `feature/motion-v1-harness`); Avatar Teacher does not adopt it. | https://github.com/heygen-com/hyperframes, https://developers.heygen.com/hyperframes.md |
| Browsers | Chrome supports VP9 with alpha; Safari ignores WebM transparency and supports HEVC-with-alpha instead. | https://jakearchibald.com/2024/video-with-transparency/, https://rotato.app/blog/transparent-videos-for-the-web |

**UNVERIFIED** (not confirmed from a public page on 2026-10-04; check before relying on it):
- the actual lifetime of a v3 `video_url` ("7 days" appears only in snippets of archived v2 docs);
- the exact v1/v2 cutoff: pages say both 2026-10-31 and "November 1, 2026 — end of support";
- whether 4K for Avatar IV and V has returned;
- whether photo avatars on Avatar IV/V can output webm, and whether Avatar V accepts photo avatars (an August 2026 changelog mentions an "Avatar V Photo Fallback");
- the webm codec, any webm resolution cap or price difference, and whether webm works with `audio_url`;
- self-serve per-second prices (the price page renders only with JavaScript);
- per-endpoint requests-per-minute limits;
- the real maximum script length (the usage page says 5,000 characters; the v3 schema shows none);
- who owns output made on the API pay-as-you-go wallet (the Terms name only the Creator, Pro, Business and Free plans);
- that the API's "Instant Avatar" naming maps to "Digital Twin";
- whether MCP discovery tools (listing avatars and voices) consume credits;
- the 14-day trash retention for videos deleted in the web app;
- the training opt-out address (obfuscated on the page);
- that WebM transparency arrives in Safari 27 (one 2026 blog says so).

---

# 32. Authorized next vs deferred

**Status (owner, 2026-10-04): AV0 is accepted.** The decisions below are locked. Implementation starts only on the coordinator's implementation GO.

**Next authorized, with NO paid calls, no live model or provider calls, and no deploy:**
- **AV2 groundwork:**
  - the AvatarBrief schema (§6);
  - the Avatar Director contract (§5.1), tested against recorded fixtures;
  - the Tutor `suggest_avatar_clip` schema and validator (§4.1), behind `TUTOR_AVATAR`, which stays off.
- **AV3 groundwork:** the AvatarProvider interface (§8) and the HeyGen v3 adapter against a **test stub only**.
- **AV4 groundwork:** the storage and cache contracts (§14).

**Not yet authorized:**
- real HeyGen API calls;
- MCP credits (AV1);
- turning `TUTOR_AVATAR` on;
- paid clips, canonical or personalized;
- Tutor generation integration (AV6);
- Motion composition (AV7);
- any deploy, including the AV5 dev clone;
- the AV8 benchmark.

Paid MCP or API calls also need the §10 account prerequisites and the owner's explicit spend approval.

**Still deferred:**
- AV9: production on digrabbithole.com. It waits for Usage & Credits, legal and privacy review, cost caps and the production GO.
- Live Avatar.
- Personalized, learner-specific or learner-requested clips (`offer: generate`): the learner-paid path, and the point where `learning_goal` takes effect.
- Voice audio coordination during playback (§4.3), in AV5/AV6.
- A shared teacher identity across the Voice Tutor and the clip: a later benchmark of a permanent Rabbit Hole teacher, a digital twin, Fish audio supplied to HeyGen, and HeyGen's native voice. Not a blocker for AV1.
- A Tutor trigger for the section-entry greeting and `completion` (their clips are product content).
- A Rabbit Hole digital twin and Avatar V: a later brand/identity decision.
- Fish-supplied audio: a priority later comparison (§18).
- Muted visual previews.
- Learner-created avatars and any voice cloning.
- Webhooks.
- The chroma-key and Safari HEVC-alpha transcodes.
- An avatar slash command.

**Locked owner decisions (2026-10-04):**
1. **Tutor action.** The action is `suggest_avatar_clip` (§4).
   - It sits behind `TUTOR_AVATAR`, which is off by default.
   - It produces only a suggestion chip and never calls HeyGen.
   - Generation begins only after an explicit Generate.
   - `learning_goal` (renamed from `content_goal`) is kept, bounded as in §4.1, and `visual_value` is internal (owner correction).
2. **V1 face.** A HeyGen stock/licensed avatar on its supported engine (Avatar IV today). A digital twin is a later identity decision: Rabbit Hole-owned, consent documented, provider terms followed (§9, §17).
3. **V1 voice.** HeyGen's native voice. Fish-supplied audio is a priority later comparison under the §18 conditions and licensing.
4. **Payment.** Canonical product moments are pre-generated by Rabbit Hole as reusable course assets, and learners never pay for them. Learner-specific or explicitly requested personalized clips may later be paid from learner or account credits (§14, §15).
5. **Cached playback.** A cached clip never autoplays, with or without sound. The learner explicitly starts it. Muted previews are deferred (§4.1, §15, §19).
6. **Voice Mode** (corrected by the owner the same day). Voice Mode never suppresses avatar suggestions. Only playback pauses Tutor TTS and STT, and the Voice loop resumes when the clip ends or stops. The two audio sources never overlap (§3, §4.1, §4.3).
7. **HeyGen account.** Before any paid prototype:
   - the account and API credentials are owned by Rabbit Hole;
   - provider training is disabled where allowed;
   - there is an explicit credit ceiling;
   - nothing depends on a personal account.

   Plus the owner's explicit spend approval for each paid call (§10).
8. **Reload bug.** The video resume-after-reload fix is a prerequisite for AV5. It is fixed once in the shared video pipeline, or landed as its own separate prerequisite commit for Parallel to review. There is no avatar-only playback state (§13).

**Interpretations, locked by the owner (2026-10-04, third round, on `826045e7`):**
1. **`learning_goal` reconciliation, approved.** A Director-only planning hint. It never reaches HeyGen, a cache key, a log, analytics or provider metadata. Canonical shared clips ignore it, and no canonical product asset depends on an individual learner's goal. Personalized learner-specific clips stay deferred (§4.1).
2. **Moment mapping, approved.** Section greeting and concept framing fold into `orientation`, and checkpoint into `reflection`. The nine `moment` values of the action stay as they are; no near-duplicate names are added. `human_explanation` and `demonstration` may become personalized generation cases when no approved reusable product clip exists (§3).
3. **Canonical chip availability, approved.** For a reusable moment, the Tutor may surface Play only when an approved cached clip exists; without one it offers no learner-paid generation. Rabbit Hole pre-generates canonical course clips as product content, so the first learner to reach a section never pays for Rabbit Hole's reusable asset. Only `human_explanation` and `demonstration` may later surface Generate for an uncached clip, behind the paid gate.
4. **Stock look selection, modified.** No matting requirement is encoded: the public API exposes no reliable matting field. AV1 picks a public stock/licensed look by visual teaching quality, avatar type, supported engine, native-voice compatibility and output quality. Transparency is preferred only where it is verified empirically, never inferred from undocumented metadata. The first real prototype is MP4; transparent WebM is a separate controlled experiment after MP4 succeeds, and transparency never blocks the first teacher prototype.

The code already holds 1–3: the validator drops `learning_goal` from every canonical path and logs only the reason; the moment table lives in `learn-tutor-validate.js`; a canonical moment without a ready clip goes to the resource stage, and only `PERSONALIZABLE_MOMENTS` returns the deferred `generate` offer.

**Owner decisions, second round (2026-10-04, on checkpoint `61c35830`, accepted):**
1. **Rabbit Hole return mapping, approved.** The Tutor action's `concept` is the child hole's concept and `to_concept` the parent concept being reconnected to (child `softmax` → parent attention: "connect softmax back to causal attention"). The brief carries them as `from_concept` (child) and `current_concept` (parent); the slot id is `rabbit_hole_return:<child>:<parent>`, and the script-slot key includes both sides, never the child alone.
2. **The separate `LearnAvatarClips` store, approved.** Learner-reachable playback never reaches generation; the read path stays apart from generation and store orchestration. Shared media helpers are reused; generation stays isolated.
3. **Director model.** The role resolves through `LEARN_TASKS`; no schema or permanent contract names a model. `claude-opus-5-5` is approved as the initial development mapping; a faster model is benchmarked once the pipeline works.
4. **These four interpretations stay open** until each is approved by its text (since locked, third round below).
5. **Pricing corrected** (§31). The first-call estimate uses the current per-minute API prices, and the rate is not assumed until discovery classifies the chosen look.
6. **AV2 live Director validation, authorized:** a small development-only run of about four canonical briefs through the real Director. It does not authorize HeyGen generation. Done (§33).
7. **Script reviewer:** exercised with real Director outputs, the deterministic rules and fake malformed or unsafe fixtures, keeping model samples minimal. Done (§33).
8. **Account prerequisite stands.** Before any paid generation, confirmation that `HEYGEN_API_KEY` belongs to a Rabbit Hole-owned HeyGen account, not a personal one. The key is not exposed, deployed or copied to Cloudflare or Fly.
9. **The first real HeyGen call stays proposed, not authorized** (§33). WebM is not locked until discovery confirms the look supports the transparent path.
10. **Output host:** no host is trusted on expectation. On the first real response the actual hostname is checked against the documented and observed host, an unknown host fails closed, the allowlist changes only with that evidence, and no redirect or other download host is followed.
11. **AV4 infrastructure waits:** no Durable Object binding, migration, Worker secret or deploy request to Home until the AV2 validation and the first-call proposal are done.

**Owner decisions, third round (2026-10-04, on checkpoint `826045e7`, accepted; AV2 complete):**
1. **History stays.** The merge of main is kept; no rebase or force-push to tidy history. Future checkpoints fetch the latest main first and follow the repo's normal integration rule.
2. **The four interpretations are locked** as written above (1–3 approved, 4 modified).
3. **Script reviewer model, approved.** `avatar_script_reviewer` resolves through `LEARN_TASKS` to `claude-opus-5-5` for the development stage; no schema names a model. A Sonnet 5.5 (low effort) versus Opus 5.5 benchmark waits until there are enough reviewer fixtures.
4. **The 4000-token budget, approved** for both roles, to avoid truncated thinking or tool output. It does not authorize longer spoken scripts; the learner-facing limits (§5.1) are unchanged.
5. **Repair policy, kept.** Director → deterministic validation → reviewer → at most one semantic repair → re-review → pass or fail. Repairs never loop.
6. **The first provider prototype is approved in principle** as §33.2 describes it (orientation, attention, the owner's script, Avatar IV, a public stock/licensed look, HeyGen native voice, 720p, 16:9, MP4, about 7 s, a $1.00 hard spend ceiling, no automatic retry). The API is not called yet.
7. **Discovery, when separately authorized,** uses only `GET /v3/avatars/looks`, `GET /v3/avatars/looks/{id}` and the relevant voice endpoint, and records only the look id, avatar type, supported engines, voice id and provider-safe capability metadata. The key is never logged. Discovery is not assumed free: the balance is recorded before and after if the API exposes it safely.
8. **Output download, first result:** inspect the returned host; HTTPS only; validate the actual provider host and fail closed on an unknown one; download locally; sniff the type from the bytes; validate the video; store it only in a temporary dev location; delete the provider copy if the API supports it. The production allowlist is never broadened on assumption.
9. **No Home action yet:** no Worker secret, binding, migration, AV4 deploy or production resource. One local API generation comes first.
10. **The gate.** The only blocker to the first provider interaction is confirmation that `HEYGEN_API_KEY` (the local secret in the root `.env`, presence-checked only) belongs to the Rabbit Hole-owned HeyGen account intended for ongoing use, with input/model-training opt-out where supported and a spending ceiling or controlled wallet. Until then there is no discovery, generation or MCP call.

---

# 33. Implementation status: AV2–AV4 groundwork (2026-10-04)

Built on `feature/avatar-teacher-v1` (worktree `avatar-teacher-v1`): this spec as accepted at `1ed5a771` on `feature/avatar-teacher-v1-spec`, rebased unchanged onto main `e59a333c`, then the groundwork. Avatar ownership moved from Parallel to the Avatar / Media agent on 2026-10-04. Parallel's uncommitted groundwork in the spec worktree was read, checked against this spec and ported where it held (below). Nothing is deployed, `TUTOR_AVATAR` stays off, and no HeyGen or MCP call was made. The only model calls are the owner-authorized AV2 Director validation (§33.1).

**What exists, and where:**

| Piece | File | Status |
|---|---|---|
| `suggest_avatar_clip` schema, the three planner lines, `learning_goal` bounds, `avatarSlotId` | `packages/control-plane/src/agents/learn-tutor.js` | Behind `TUTOR_AVATAR=on` in `planOnce` (`learn-tutor-routes.js`). Off, the planner prefix and request hash exactly as on main (pinned in `test/learn-avatar.test.js`). |
| Trigger validator (§4.1 questions 1–6), router rows, `avatar_moments` in the planner context | `packages/web/src/learn-tutor-validate.js`, `learn-tutor.js` | `route({ avatar })` adds the action; `runTurn` never passes `avatar` yet (AV6). |
| AvatarBrief schema and validator, script rules, Director contract (input boundary, `avatar_script` tool, `tool_choice: auto`, one schema-only re-ask), the fresh blind reviewer (`script_review` tool), the one repair (`prepareScript`) and `assembleBrief` | `packages/control-plane/src/learn-avatar-brief.js` | Unit-tested on recorded and fake replies; validated live on four canonical slots (below). The store refuses `script` without injected models. |
| Canonical slots from the Tutor registry (`canonicalRequest`, `canonicalInput`) | `learn-avatar-cache.js` | Per concept: the card that teaches it, its claims and learning question (cited as the card's ref `C<n>`) and up to 3 pinned code source notes (`S<n>`, with the course commit). The store's `POST script` takes only `{ moment, concept, to_concept?, duration_seconds? }`; authored content never comes from the caller. |
| `LEARN_TASKS.avatar_director` and `avatar_script_reviewer` | `learn-models.js` | `claude-opus-5-5` as the initial development mapping, no fallback, 4000 tokens (Opus 5.5 always thinks, inside `max_tokens`). |
| AvatarProvider contract and the HeyGen v3 adapter | `packages/control-plane/src/learn-avatar-provider.js` | Against a stub transport only. Off unless `LEARN_AVATAR_PROVIDER=heygen` and `HEYGEN_API_KEY`. Profiles registry empty until AV1 picks the stock look and voice. |
| Script-slot key, render key, scopes, `learn-avatar/` keys, type sniffing, the shared `public_course` store `LearnAvatarClips`, the read route `avatarClipFetch` | `packages/control-plane/src/learn-avatar-cache.js` | Not bound or routed: the `LEARN_AVATAR_CLIPS` binding, its migration and the `/api/learn/avatar` routes land with the AV4 deploy GO. |
| Real content type on shared video | `learn-video.js` (`serveClip`, `downloadClip`) | LearnVideos serves a job's own `contentType` (MP4 when none is recorded, as before). |
| Voice hold and release | `packages/web/src/voice-session.js` | `hold()` / `release()` and state `held`; not exposed by `LearnVoice.jsx` or labelled in `VoiceMode.jsx` yet (AV5). |

**Decisions made while building (within this spec):**
- **The slot id** (the return mapping approved by the owner, §32 second round, decision 1). A clip slot is `moment:concept:to_concept` (`avatarSlotId`). In a brief it comes from `briefSlotId`: a `transition` goes from `current_concept` to `next_concept`; a `rabbit_hole_return` goes from the child hole's concept (`from_concept`) back to the parent concept (`current_concept`), so its slot is `rabbit_hole_return:<child>:<parent>` and its script-slot key carries both. The brief validator requires `next_concept` for a transition and `from_concept` for a return; a test keeps two returns from one child to two parents apart.
- **The shared store is its own Durable Object class.** `LearnAvatarClips`, one instance per scope (`idFromName(["avatar", kind, course])`). It is not a branch inside LearnVideos: every learner can POST to their own LearnVideos through `/api/learn/videos`, and that must never reach a Rabbit Hole-paid canonical render. It reuses LearnVideos' job pattern and its shared `downloadClip` / `serveClip`.
- **Canonical preparation in the store.** `POST script` (cached per script-slot key: the second request for a slot makes no model call), `POST approve` (the owner's approval, §14), `POST render` (`paidRefusal` first, then only an approved slot script; a ready render key makes no provider call; two concurrent misses submit once). `GET` is the ready list the Tutor's resource stage reads; `GET ?asset=` serves the clip with its own type. Who may call the three POSTs is decided with the route at the AV4 deploy GO; learners only ever reach `GET`, through `avatarClipFetch`.
- **Never repeat a paid POST.** A lost submit, a `request_in_progress`, a 5xx on submit, a crash before the ticket is stored, a timeout or any failure after a ticket exists (except HeyGen's own `failed`) is `uncertain`: a retry answers 409. A refusal HeyGen stated (credits, 429, policy, configuration) is retryable with a new confirmation.
- **The real type from the bytes.** The clip's type is sniffed from its first bytes (EBML → `video/webm`, `ftyp` → `video/mp4`), stored on the job, used in the R2 key's extension and served as is.
- **Personalized (learner-scope) clips are refused** by the store and the media key until the learner-paid path is authorized (§32).
- **The V1 course** is `karpathy/nanoGPT@3adf61e154c3fe3fca428ad6bc3818b27a3b8291`, the Tutor's pinned nanoGPT revision (`nanoSourceVersion`, which only Vite can import; a test keeps the two equal).
- **Voice hold.** `hold()` stops Tutor TTS, cancels a turn in flight (its late answer is never spoken), pauses STT and enters `held`; Voice Mode stays on. `release()` resumes STT and listening once every hold is released. A hold while Voice is still starting keeps the mic closed after it opens. Exit drops the holds, and a later release is a no-op. It is generic: narrated Motion uses the same calls.
- **HeyGen details re-checked** on 2026-10-04 against the public create-video and error-code pages: `caption` is an object (`{ file_format: "srt" }`), and "A sidecar subtitle file is always returned via subtitle_url". The first real render disproved that reading: without a caption field no subtitle_url came back, so adapter-2 sends `caption: { file_format: "srt" }` (§33.3, §33.4); the error body is `{ error: { code, message, param?, doc_url } }`; the Idempotency-Key allows `[A-Za-z0-9_:.-]{1,255}` (a 64-hex render key fits).

**Parallel's groundwork: kept, changed, dropped.**
- Kept, after checking against this spec: the action schema and planner lines; `learningGoalProblem`; the router rows and the six-question validator; the brief schema, script rules and Director contract; the adapter, its error mapping and the output-host allowlist; the two keys and the type sniffer.
- Changed: `directorModel` no longer reads an `AVATAR_DIRECTOR_MODEL` env override (§5.1 resolves the role through `LEARN_TASKS` only); the brief validator also checks card ids and the transition and return concepts; the media key refuses learner scope instead of hashing a session identity; the AV4 store and route are added (Parallel's version stopped at the keys).
- Dropped: `productionWorker` in `dev-forwarding.js`. It is not in this spec, it touches shared infrastructure code, and it relied on `PUBLIC_ORIGIN` as a production marker without a check. The off switch stays §9's: no provider or key on production before AV9.

**Not yet wired (each needs its GO):** the store's binding, migration and routes, its live model wiring, and the `/api/learn/avatar` row in `learn-artifact-generation.md`'s gate table (AV4 deploy); the clip card, PiP, captions and the Voice hold in the UI (AV5, after the shared reload fix); `runTurn` passing `avatar`, the ready list, the canvas's clips and `avatar_seen` (AV6); `capabilities()` from `supported_api_engines` (AV3 proper).

## 33.1 AV2 live Director validation (2026-10-04)

Owner GO (§32 second round, decisions 6 and 7). Run by hand with `node tests/evals/avatar-director.mjs`; the full record is `tests/evals/results/avatar-director-2026-10-04.json`. Every model call went through `LEARN_TASKS` (`claude-opus-5-5` served each one, `stop_reason: tool_use` every time, no format re-ask). No HeyGen call, no video.

| Case | Slot | Final script | Words / sentences | Path | Director ms | Cost |
|---|---|---|---|---|---|---|
| A | `orientation:attention:` | "Welcome to attention. When the model reads one character, which earlier characters does it look at?" | 16/19, 2/2 | director → review pass | 3,005 | $0.0188 |
| B | `transition:causal-mask:softmax` | "Masked scores become negative infinity, so softmax gives them weight exactly zero. Next: how softmax turns scores into weights." | 19/19, 2/2 | director → review **blocked** (`unsupported_claim`) → one repair → review pass | 5,791 + 6,218 | $0.0724 |
| C | `rabbit_hole_return:softmax:attention` | "Back in attention, that same softmax turns the row of scores into positive weights that add up to one." | 19/19, 1/2 | director → review pass | 5,317 | $0.0285 |
| D | `human_explanation:score-scaling:` (12 s) | "Before the mask and softmax, every score gets multiplied by one positive number. Smaller flattens the weights, larger sharpens them, yet the highest-scoring key stays the same." | 27/28, 2/2 | director → review pass | 6,661 | $0.0289 |

- **Every final script** validates as a full AvatarBrief (`validateBrief` on `assembleBrief`), has no rule problem (length, sentences, code, equations, mastery, internal language), and cites only real refs: cards and `model.py` lines at the course commit.
- **The reviewer** passed all four final scripts, blocked B's first draft once (the one repair fixed it), and caught both unsafe fixtures that pass every deterministic rule: F1 (an invented origin story, and "reads the ones after it", which contradicts the card) as `unsupported_claim` twice, and F2 ("you are now an expert") as `mastery_claim`.
- **Deterministic rules** were also exercised with fakes (`test/learn-avatar.test.js`): a mastery claim and code (`softmax(x)`, `att @ v`, `masked_fill`, `att[0]`) are blocked before any review call and repaired once; a malformed review fails closed; the reviewer's request carries no Director prompt, teaching goal or model id.
- **Totals:** 12 calls (5 Director, 7 reviewer), 19,130 input / 4,721 output tokens, **$0.171** at $4 / $20 per MTok, plus a $0.019 smoke run of case A. Latency: Director 3.0–6.7 s per call; reviewer 2.8–9.8 s.
- **What the provider would receive** for each slot is the final script text plus the render settings (`renderInputFor`), nothing else.

## 33.2 The first paid HeyGen call: approved, run on 2026-10-04 (§33.3)

Approved in principle by the owner (§32 third round, decision 6); nothing below has run. It needs, in order: (1) confirmation that `HEYGEN_API_KEY` belongs to the Rabbit Hole-owned HeyGen account intended for ongoing use, with training opt-out where supported and a spending ceiling or controlled wallet (the current gate, §32 third round, decision 10); (2) a separate authorization for discovery; (3) the GO to make the one generation call.

**Step 0, discovery (read-only, no generation).** Three GETs with the key, never printed: `GET /v3/avatars/looks?ownership=public&avatar_type=studio_avatar&limit=50`, then `GET /v3/avatars/looks/{look_id}` for the chosen look, and the look's `default_voice_id` (checked against `GET /v3/voices`). Recorded: `id`, `avatar_type`, `supported_api_engines`, `default_voice_id`, `preferred_orientation`. Whether these GETs cost credits is UNVERIFIED (§31), so the balance is read before and after.
- **Avatar type** comes from `avatar_type` (`studio_avatar` | `digital_twin` | `photo_avatar`); the price is chosen only after it is read.
- **Transparency cannot be confirmed by discovery.** No documented look field reports matting, transparency or WebM support (the get-look and list-looks references, re-read 2026-10-04). HeyGen documents only the failure ("This video avatar does not support webm output.").
- **Selection rule:** a public studio avatar whose `supported_api_engines` includes `avatar_iv`, with a neutral teacher presentation, `landscape` or `square`.

**The one call.**
- **Path:** `HeyGenAvatarProvider` with Node's fetch, from a one-off local dev script. No Worker, no deploy and no key outside the root `.env`. The script would be written at the GO.
- **Request:** `POST https://api.heygen.com/v3/videos`, `Idempotency-Key: <render key>`, body:

  ```
  { "type": "avatar", "avatar_id": "<look id from Step 0>", "voice_id": "<default_voice_id>",
    "script": "Welcome to attention. Here, each character looks back at the earlier ones to decide what matters.",
    "engine": { "type": "avatar_iv" }, "output_format": "mp4", "resolution": "720p", "aspect_ratio": "16:9",
    "title": "rh-avatar-<render key prefix>" }
  ```

- **Script:** the owner's orientation script, 16 words, which passes every deterministic rule; the script-slot pipeline above produces its own wording for product clips.
- **Output format:** MP4. WebM is not locked until the transparent path is confirmed, and discovery cannot confirm it. A WebM attempt is a separate decision for the owner: it either renders with alpha or fails with HeyGen's documented error, and whether that failure is charged is UNVERIFIED.
- **Expected duration:** about 6.5–7.5 s (16 words at about 150 words a minute, plus the voice's lead-in and tail).
- **Then:** poll every 10 s; check the `video_url` hostname against the allowlist, failing closed with `unlisted_host:<hostname>` as evidence; download without following redirects, under 40 MB; sniff the type from the bytes and reject anything but the requested MP4 or a duration past the ceiling; save to a temporary dev location (`.claude/jobs/<id>/tmp/avatar/`, never committed, never R2); `DELETE /v3/videos/{video_id}`. The production allowlist changes only on the host this call actually returns (§32 third round, decision 8).

**Expected price** (owner's current API prices, charged per generated second):

| Avatar type (from Step 0) | Rate | 7 s | 10 s |
|---|---|---|---|
| `studio_avatar` (expected for a public stock look) | $4.83/min | $0.56 | $0.81 |
| `photo_avatar` | $2.31/min | $0.27 | $0.39 |
| `digital_twin` (not V1) | $4.83/min | $0.56 | $0.81 |

**Suggested ceiling:** $1.00 for this one call, which covers about 12 s at the Studio rate. The wallet holds the $5 minimum top-up. There are no automatic retries: a failed or uncertain call stops and is reported.

## 33.3 The first HeyGen prototype: result (2026-10-04)

Owner GO the same day: the key confirmed as the Rabbit Hole-owned HeyGen account; a $5 prototype budget, at most $1 per generation, no automatic retry; temporary local storage only (no R2, no Worker, no deploy). Run by hand with `node tests/evals/heygen-prototype.mjs` (`discover`, then `generate <look> <voice>`, then `resume`, which polls the stored ticket again and never resubmits); the record and the clip stay in the gitignored `.claude/jobs/heygen-prototype-1/tmp/avatar/`.

- **Account:** `billing_type: wallet`, USD, $5.00, auto-reload off (`GET /v3/users/me`; only billing fields are read).
- **Discovery cost nothing:** the wallet read $5.00 before and after about 30 GETs (12 pages of public studio looks, 12 of English voices, the look, and the voice pages). Public studio looks with `avatar_iv`: 101 of the first 600.
- **Look:** `Judy_Teacher_Standing_public` ("Judy Teacher Standing"), `avatar_type: studio_avatar`, `supported_api_engines: [avatar_v, avatar_iv, avatar_iii]`, `preferred_orientation: landscape`, 1280×720; a classroom set (whiteboard, globe), glasses, cardigan. Chosen over the business and office looks as the most teacher-like; the preview was inspected first.
- **Voice:** the look's `default_voice_id` `b45b647c9a2649dba247ff275365df2c`, "Judy": public, English, female, `default_engine: orca` (engines starfish, orca, elevenlabs, elevenlabs_v3).
- **Request**, as the adapter sent it (`HeyGenAvatarProvider.submit`, recorded at the transport; the key header is never recorded): `POST /v3/videos`, `Idempotency-Key: 5de3d1c2…` (the render key), body `{ type: "avatar", avatar_id: "Judy_Teacher_Standing_public", script: "<the owner's orientation script>", voice_id: "b45b647c…", engine: { type: "avatar_iv" }, output_format: "mp4", resolution: "720p", aspect_ratio: "16:9", title: "rh-avatar-5de3d1c2cea0" }`. One POST; no retry.
- **Latency:** the submit answered in 1.9 s; HeyGen's own `created_at` → `completed_at` is 223 s (3 min 43 s).
- **Cost:** $0.48 (wallet $5.00 → $4.52). That matches 6 whole seconds at $4.83/min; the exact billing rule is not documented (the estimate was $0.64 for 7.9 s).
- **Output host:** `https://files2.heygen.ai` (path `aws_pacific/avatar_tmp/…`), no port, no redirect. It failed closed on the first poll as `unlisted_host:files2.heygen.ai` (the list held only the docs' example host, `files.heygen.ai`). On that evidence `HEYGEN_OUTPUT_HOSTS` is now `['files2.heygen.ai']` only; the never-observed `files.heygen.ai` was removed and fails closed (tested). The preview images of public looks come from the same host.
- **Content type:** the download answers `200 binary/octet-stream`, so the shared `downloadClip` refused it (`video/*` only). It now takes `{ sniffed: true }` from a caller that types the clip from its own bytes (the avatar store and this script), which then accepts a generic binary header; LearnVideos is unchanged (tested).
- **MP4 validation:** sniffed `video/mp4` (`ftyp`), 6,000,835 bytes; H.264 1280×720 25 fps, AAC 48 kHz stereo; 6.8 s from the MP4 header (HeyGen reports 6.77 s), inside the 12.4 s that $1 buys at the Studio rate.
- **Visual and audio check** (stills at 0.3, 2.0, 3.6, 5.2 and 6.5 s; audio loudness per 100 ms): photoreal, a stable framing and identity, no watermark, mouth shapes that change with speech, a natural closed-mouth smile at the end. Speech runs 0.3–6.5 s with a pause between the two sentences, peaking at −12 dBFS. Lip sync and the voice's delivery need a human watch.
- **Provider copy:** `DELETE /v3/videos/{id}` succeeded; `GET` afterwards answers `404 video_not_found`.
- **Captions: no `subtitle_url` came back.** The create-video reference says a sidecar subtitle "is always returned"; this render had none, so the V1 assumption (send no caption field, §33) does not hold.
- **Training and privacy:** neither the API nor HeyGen's privacy policy (updated 2026-08-11) offers an account setting or toggle. Non-enterprise inputs may be used "to train and enhance the models"; the opt-out is a request by email to HeyGen support. Enterprise and business offerings are governed by their contracts. Not done: it is an outward request from the account owner.

## 33.4 The second HeyGen prototype: transparent WebM and SRT captions (2026-10-04)

Owner GO the same day: exactly one more generation, at most $1, no automatic retry, inside the $5 prototype budget; temporary local storage only. Same look, voice, engine, script, 720p and 16:9, with `output_format: "webm"` and the documented caption setting. Run with `node tests/evals/heygen-prototype.mjs --job heygen-prototype-2 generate Judy_Teacher_Standing_public b45b647c9a2649dba247ff275365df2c webm`, then `resume`.

- **Docs, checked first** (three independent readers and an adversarial check of the public v3 reference and guides): `caption` is `CaptionSetting { file_format: "srt" (the only value), style?: "default" }`; without `style` only the SRT sidecar is produced. Unknown body keys are rejected (`additionalProperties: false`). Nothing documents whether WebM and captions combine, whether a look supports matting, or whether a rejected WebM is charged.
- **Adapter:** `heygen-v3:adapter-2` sends `caption: { file_format: "srt" }` for every render (`input.captions`), so the render key changes with the version.
- **Request:** `POST /v3/videos` with the body above plus `"output_format": "webm"` and `"caption": { "file_format": "srt" }`. HeyGen answered `200`, `status: waiting`, `output_format: "webm"`: no matting rejection.
- **Latency:** submit 1.3 s; HeyGen `created_at` → `completed_at` 152 s.
- **Cost:** $0.49 (wallet $4.52 → $4.03). Both prototypes together: $0.97 of the $5 budget.
- **Output hosts:** `video_url` on `https://resource2.heygen.ai` (it failed closed as `unlisted_host:resource2.heygen.ai`; the provider copy was kept, nothing was retried); `subtitle_url` and `thumbnail_url` on `files2.heygen.ai`; no `captioned_video_url` (no `style` sent). On that evidence `HEYGEN_OUTPUT_HOSTS` is `['files2.heygen.ai', 'resource2.heygen.ai']`; `files.heygen.ai` stays rejected (tested). The download then resumed from the stored ticket without a second POST.
- **WebM validation:** sniffed `video/webm` (EBML), 6,155,063 bytes, 6.8 s, inside the $1 ceiling; VP9 `yuva420p` 1280×720 25 fps with the Matroska AlphaMode element = 1 and BlockAdditions (alpha) in all 170 video blocks; Opus 48 kHz stereo audio.
- **Alpha, measured on the decoded pixels** (libvpx-vp9; independent forensics, matte and caption checks plus a skeptic that tried to refute them): every frame has a real matte, about 77% fully transparent, 20% fully opaque and 2.3% soft edge; all four corners transparent; consecutive-frame mask overlap at least 0.996 over all 170 frames; no pixel inside the face, glasses lenses or clothing is transparent; no alpha flicker. FFmpeg's native vp9 decoder drops the alpha (the subject on black), so any server-side decode must use libvpx-vp9.
- **Matte quality:** good on a dark canvas. Defects: a lime fringe on the right edge of the hair bun (the green sticky note in the set), a light whiteboard halo on the top and left hair edge, and a pale whiteboard sliver beside the neck kept opaque in 157 of 170 frames (median 23 px, at most 88 px, slowly varying). The edge colour is matted onto black (premultiplied-like), so a straight-alpha compositor draws a 2-4 px dark rim, invisible on a dark canvas and visible on white. How Chrome, Firefox and Safari actually composite it was not measured.
- **Framing:** the subject fills about 37% of the frame width and 93% of its height, touching only the bottom edge. A 16:9 picture-in-picture is two-thirds empty; cropped to the subject box (about x 440-930) it reads well even at 240×135.
- **Captions:** `captions.srt`, UTF-8, LF, 3 cues, words equal to the script, at most 38 characters a line and 16.8 characters a second; cue edges within 300 ms of the speech. One weak split: cue 2 ends on "at the" while the speaker's own pause falls inside cue 3, and the cues are 40 ms apart.
- **Provider copy:** deleted; `GET` answers `404 video_not_found`.
- **Training opt-out:** drafted for the account owner, not sent (no API or account setting exists, §33.3).

