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

**V1 mapping to real Tutor signals.** The Tutor on main has no "section" or "course completion" state:
- Its evidence lives in a session-scoped browser store (`packages/web/src/learn-tutor-evidence.js:1-23`).
- Its router rows are `slash`, `returned`, `off_slice`, `gap`, `gap_inline`, `misconception`, `misconception_explain`, `uncertain_unsettled`, `uncertain`, `not_yet_observed` and `understood` (`packages/web/src/learn-tutor.js:144-177`).

So in V1 a purpose is tied to an existing signal:

| Purpose | The Tutor may suggest it when | Note |
|---|---|---|
| `rabbit_hole_intro` | a hole's opening turn (`learnerIntent` kind `opening`) | at most once per hole |
| `rabbit_hole_return` | row `returned` | |
| `concept_intro` | row `not_yet_observed` | |
| `section_transition` | row `understood`, next to a `suggest_depth` | introduces the next ladder card (`ladderStep`) |
| `checkpoint_feedback` | row `understood`, after a settled `pass` this turn | no mastery wording (§7) |
| `section_greeting`, `course_completion` | never by the Tutor in V1 | no section-entry turn or completion state exists; prototype clips only (AV1) |

The Tutor never suggests a clip on the rows that need the learner's attention elsewhere, or that are a direct request: `gap`, `gap_inline`, `misconception`, `misconception_explain`, `uncertain`, `uncertain_unsettled`, `slash`, `off_slice`. The learner's own explicit request for a teacher or avatar clip allows it on any other row.

"~1 per section" becomes, in V1, two limits counted in the Tutor's session store:
- at most one `show_avatar_message` per turn;
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
  type: "show_avatar_message",
  purpose: "section_transition",
  content_goal: "...",
  max_duration_seconds: 10,
  context_refs: [...]
}
```

Tutor chooses **why / when** a human-teacher moment is useful.

The artifact/provider layer chooses **how** to generate it.

Conceptual architecture:

```text
Tutor
  ↓
show_avatar_message
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
{ type: "show_avatar_message",
  moment,                  // rabbit_hole_intro | rabbit_hole_return | concept_intro
                           // | section_transition | checkpoint_feedback   (§3 table)
  concept,                 // a registry concept id (learn-tutor-claims.js CONCEPTS)
  to_concept?,             // section_transition and rabbit_hole_return: where the learner goes next
  max_duration_seconds? }  // integer 3..30; default 8
```

**What changed from the conceptual action:**
- **`moment`, not `purpose`.** The planner tool has one flat action-item schema, and its `purpose` is already the `ask_question` enum `diagnose | predict | explain_back | transfer` (`agents/learn-tutor.js:154`). The AvatarBrief keeps `purpose`, with the same values as `moment`.
- **No `context_refs`.** The validator resolves `concept` and `to_concept` against `CONCEPTS`, and the sources come from the concept's slice cards, as `suggest_dive` resolves its concept.
- **No `content_goal` in V1.** Free text from the planner is a channel for the learner's words into the Director and could leak into a script. It also defeats cross-learner caching (§14): the moment and the concepts fully define a V1 clip. A personalized goal comes back with personalized clips (deferred, §32).

**Validation** (`packages/web/src/learn-tutor-validate.js`, the existing four stages):

| Stage | Rule |
|---|---|
| schema | `moment` is in the V1 list; `concept` and `to_concept` are in `CONCEPTS`; `max_duration_seconds` is an integer from 3 to 30 |
| route | allowed only when the router added it for this row (§3 table), or on the learner's explicit request. Never on a voice turn in V1: Voice Mode already speaks as the Tutor, and two teacher voices at once is not V1. At most one per turn, and one per (canvas or hole, concept) per session (a new session-store counter next to `socratic`). |
| resource | the concept exists; `section_transition` also needs a `ladderStep` |
| consent | it never starts anything. It always becomes a chip; there is no `mode: "navigate"`, and an explicit request does not change that |

It is never the turn's only action:
- the router always keeps `respond_text` allowed (`finish`, `learn-tutor.js:149`);
- a fast plan with no words already escalates to Opus (`fastPlanProblem`, `learn-tutor-routes.js:194-199`).

So the Tutor's text turn is never lost.

**Execution.** `executeActions` (`learn-tutor.js:496`) turns it into a chip such as `Watch: Softmax intro · 8 s`. On click:
1. **Cached clip ready in its scope (§14):** a video card is inserted (§13) and plays from that click. The click is the learner's gesture, so sound is allowed. Nothing is paid, and no proposal is shown.
2. **No cached clip:** the Avatar Director writes the script, or reuses the script slot's (§14). Then the paid proposal appears in the composer: the script, the duration, "This uses paid generation." and [Cancel] [Generate]. There is no canvas skeleton yet (§15).
3. **Generate:** a skeleton reserves the slot, and the confirmed card (`confirmedStart`) replaces it and runs the job.

**Planner changes (AV6):**
- `ACTION_TYPES` and the `TUTOR_TOOL` item schema gain the type and the fields above.
- `PLANNER_SYSTEM` gains one line: `show_avatar_message` only suggests a short teacher clip, at most once, only when `context.allowed_actions` lists it. The existing "never generate new artifacts" line (`agents/learn-tutor.js:176`) stays true.
- `tool_choice` stays `{type: "auto"}`: `claude-opus-5-5` answers HTTP 400 to a forced tool choice (`agents/learn-tutor.js:215-217`; Motion V1 spec §4.9).

Adding the type changes the planner request on every turn. That includes the cached prefix, which the Voice and golden-trace tests pin. So AV6 sits behind an off-by-default knob (`TUTOR_AVATAR`), in line with Tutor v2's off-by-default rule. Turning it on needs the owner's sign-off and a re-run of the Tutor benchmark.

This is the first Tutor action that can lead to a paid job. The Tutor's locked decisions still list "`generate_artifact`, `suggest_motion` and the paid-tool confirmation UX" as open (`docs/features/tutor-v1-locked-decisions.md:249, 260, 553`). AV6 resolves that open item for avatar clips only, and only with the owner's approval.

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
| **Allowed inputs** | the purpose (`moment`) and the registry concept ids. The authored content of those concepts: `CLAIMS` statements, the cards' `learningQuestion` and titles, and up to 3 pinned source notes per card, at the course's pinned commit. The lesson/TOC titles. With `personalization: session_concepts` only: the ids of concepts that have a settled `pass` this session. |
| **Forbidden inputs** | the raw learner message or voice transcript; Tutor turns and text; evidence events, probabilities or misconception ids; canvas state; private repository source (V1 covers the public `karpathy/nanoGPT` course only, the only place the Tutor runs: `docs/features/production-tutor-entry.md`); identity (email, name, org); auth data; model or provider ids |
| **Output** | a validated AvatarBrief (§6) with `script`, or a failure. A failure shows no chip or proposal ("The teacher clip isn't available right now."). The Tutor's text answer stands. |
| **Grounding** | every factual phrase maps to a `source_refs` entry. The script may state only claims that are already in the concepts' `CLAIMS` statements or `learningQuestion`. |
| **Script limits** | at most `floor(duration_seconds × 2.4)` words, about 150 words a minute (8 s = 19 words, 15 s = 36, 30 s = 72). At most 2 sentences, or 3 above 15 s. No code characters (the Tutor's speakable test, `` /[`{}<>]\|=>/ ``, `learn-tutor-validate.js:38`). No equations. No mastery or score wording. No mention of the Tutor, the model, the provider or "learner state". |
| **Model call** | role `AVATAR_DIRECTOR_MODEL`, resolved through `LEARN_TASKS` (`learn-models.js`) and never named in the brief. `tool_choice: auto` with one output tool, harness validation and at most one schema-only re-ask, as in Motion V1 §4.8–§4.9. Never the artifact path's forced `{type: "any"}` (`learn-artifact.js:53`). |
| **Review** | a fresh, blind, text-only script reviewer, with the blocking categories unsupported claim, mastery claim, internal language, code/equation and over length. At most one repair. In development, the owner also approves every shared-scope script (§14) before its first paid generation. |

---

# 6. AvatarBrief

Define one canonical structured request.

Final V1 schema. This section is the only definition; other sections reference it.

```text
AvatarBrief {
  id
  brief_version                  // "avatar-brief/1"
  prompt_spec_version            // Director prompt template version; part of the script-slot key
  purpose                        // section_greeting | section_transition | concept_intro | checkpoint_feedback
                                 // | rabbit_hole_intro | rabbit_hole_return | course_completion
  origin                         // tutor | learner_request | dev_fixture
  scope                          // cache scope (§14): { kind: "public_course", course: "karpathy/nanoGPT@<commit>" }
                                 //                  | { kind: "learner" }   (never shared)

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
    voice_profile                // a Rabbit Hole profile id
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
  - The adapter picks per profile: Avatar V if the profile is an eligible digital twin, else Avatar IV.
  - Avatar III is the cheap fallback, and only a configured option for the AV8 cost benchmark.
- **Secret and configuration** (proposed names; none exists today):
  - `HEYGEN_API_KEY` is a Worker secret, set on the development Worker only, at AV3, with the owner's GO.
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
- comparing Avatar IV vs Avatar V,
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
2. **Account.** Use a HeyGen account owned by the Rabbit Hole org, never a personal one (the infrastructure-ownership rule). The account's owner approves its plan and spend.
3. **Credits.** MCP generation "draws on your existing HeyGen plan's credits". That is the web plan, not the API pay-as-you-go wallet AV3 will use. So every MCP generation is paid. AV1 needs its own owner GO with a credit ceiling.
4. **Explore before paying.** Discovery tools such as `list_avatar_groups`, `list_avatar_looks`, `get_avatar_look` and `list_voices` are expected to cost nothing. Check that against the account's credit balance before and after; it is UNVERIFIED (§31).
5. **Inputs are fixtures only.** The prototype scripts in §21, written by hand or by the AV2 Director from fixtures. Never a learner's words, a transcript, private source or anything from a real session.
6. **Generate.** Use `create_video` and `get_video` for the §21 set: Avatar IV vs Avatar V where the look allows it, and MP4 vs WebM alpha. Record the video id, engine, settings, wall-clock latency and credits used.
7. **Clean up.** Download what the evaluation needs to the job's temp folder (`.claude/jobs/<id>/tmp/avatar/`, never committed). Then `delete_video` each prototype on HeyGen.
8. **Promote nothing.** No MCP output becomes a learner-facing asset. Shared production clips come only from the REST path (AV3–AV4), with provenance.

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
   - The adapter's `capabilities(profile)` reports alpha per profile. V1 picks an avatar profile that supports it.
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
- **Reload.** A paid video card saved mid-job never resumes after reload, share or fork. It is left with a permanent progress bar. The cause: `follow(placementId)` polls in memory only and never stores the id on the block (`LearningBlocks.jsx:1366-1389`; finding `paid-persist-8`, `docs/features/learn-cleanup.md:193`, deferred to unit U8). The avatar card must not ship with this bug. AV5 either lands after U8's fix, or fixes it in the shared `VideoBody` (store the placement/job id on the block, re-follow on mount), coordinated with `feature/learn-cleanup`.
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

   The first validated and approved script for a slot is reused by everyone who reaches that slot.
2. **Render key.** This is the conceptual key above, with every provider-specific value resolved server-side:

   ```text
   render_key = sha256(script.text, provider, provider_avatar_id (look), provider_voice_id,
                       engine, alpha, aspect_ratio, resolution, framing, expressiveness,
                       motion_direction, captions, adapter version)
   ```

**Scopes.** LearnVideos is per learner: its Durable Object id is `idFromName([org, app, email])`, and "Cache and placements are private to this learner in this app/workspace" (`learn-video.js:26-27`). A greeting shared across learners cannot live there. So:

| Scope | Used when | Where the job and index live |
|---|---|---|
| `public_course` | `personalization: none` on the public `karpathy/nanoGPT` course at its pinned commit | one Durable Object instance per scope, `idFromName(["avatar", scope])`, with the LearnVideos pattern: `blockConcurrencyWhile`, one generating job, alarm polling, never resubmit. Two learners who miss the same key at once pay once. |
| `learner` | anything personalized, any private course or repository, and any learner-requested free-form clip (deferred) | the learner's own LearnVideos instance, unchanged |

- **Storage.** `LEARN_MEDIA` through `learnMedia(env)`, under the key `learn-avatar/<scope hash>/<render_key>.<webm|mp4>`. That bucket is `rabbit-hole-dev-learn-media` on development and `rabbit-hole-prod-learn-media` on production.
- **Playback.** An asset GET checks the viewer's access to the scope: any signed-in learner of the course for `public_course`, the owner only for `learner`. The canvas block holds only `operation.render_key` and `scope` (§13).
- **Reusable across learners:** only `public_course` clips. The script, the script slot and the clip contain no learner data by construction (§5.1).
- **Invalidation.** There is no TTL. A key changes when any input changes: a `prompt_spec_version` bump, a new course commit, an avatar or voice profile change, or an engine or adapter change.
  - Old objects are swept by a manual purge in development; production retention is decided at AV9.
  - Revoking an avatar's consent disables the profile and purges every clip made with it (§17).
  - A provider-side copy is deleted as soon as the clip is stored (§16).
- **Pre-warming.** In development the owner may pre-generate the shared V1 slots (the §21 set) with an approved paid GO. Learners then mostly hit the cache, and Tutor suggestions then cost nothing.

---

# 15. Paid behavior

New avatar generation is a paid-generation capability.

Do not silently trigger provider generation on ordinary Tutor turns.

Policy:

```text
cached clip exists
→ may show/play immediately if product rules allow

new generation required
→ proposal / explicit confirmation / credits flow
→ Generate
→ provider call
```

The current usage/credits system may not yet implement final quote/reserve/settle semantics.

Therefore production-paid generation remains deferred until the payment architecture is ready.

Development prototype generation can be separately approved.

**Paid-generation boundary, as built today:**
- **One gate for every provider.** Every avatar submission runs `paidRefusal(body)` (`packages/control-plane/src/learn-paid.js`) in its Durable Object before the provider call. Without `confirmed: true`, which only a Generate press sends, the answer is HTTP 428 `needsConfirm` (commit `2cb7f566`; `docs/features/learn-artifact-generation.md`, "Paid generation boundary"). AV3 adds an `/api/learn/avatar` row to that doc's gate table.
- **Free paths.** A cached clip is free: no proposal, and it plays on the learner's click. The Director's script call costs Rabbit Hole a model call, not the learner a provider generation.
- **No skeleton before commitment.** A canvas skeleton means "we have committed to creating an artifact here" (`docs/features/canvas-skeleton-cards.md` on `ui/canvas-skeleton-cards`). So:
  - nothing appears on the canvas at the chip or at the proposal;
  - Cancel shows nothing;
  - Generate reserves the slot and inserts the confirmed card (`confirmedStart`), which replaces the skeleton at once and shows its own in-card progress;
  - a cached clip inserts instantly and needs no skeleton.
- **No automatic paid retries.** A failed or `uncertain` job's Retry asks for confirmation again, as `VideoBody` does today. There is one generating avatar job per Durable Object.
- **Who pays for a shared clip.** The first learner who confirms a `public_course` slot pays, and later learners reuse it for free. Whether production instead pre-warms every shared slot at Rabbit Hole's cost, so no learner ever pays for a shared clip, is an owner decision (§32).
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

It never receives an email, name, org, app, canvas or turn id, and no `callback_id` that identifies a learner. Because V1 polls, there is no callback URL.

**Further rules:**
- **The Director boundary is the guarantee.** The V1 script is built only from public course content and registry ids (§5.1). Even a leaked script reveals nothing about a learner.
- **Provider retention.** HeyGen's non-enterprise privacy policy and Terms allow it to use inputs "to train or otherwise improve" its models, with an opt-out by email; enterprise data is excluded by default (§31).
  - Before any real generation, the Rabbit Hole HeyGen account opts out of training (an owner action, recorded).
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
- **Allowed identities.** Only (a) HeyGen stock studio avatars and voices under HeyGen's terms, or (b) one Rabbit Hole-owned digital twin of a consenting adult, created through HeyGen's own consent flow.
- **Not allowed:** photo avatars of real people, learner-created avatars, voice clones of anyone but that consenting owner (through the provider's flow), and celebrity or third-party likeness.
- **Profile registry.** Each avatar and voice profile is one server-side record:

  ```text
  { profile_id, provider, provider_ref, kind: stock | owned_twin, consent_basis,
    consent_record_ref (private), granted_at, revoked_at? }
  ```

  It lives in server configuration, never in a block or brief. Learners see only "AI-generated teacher".
- **Revocation.** Revoking consent disables the profile at once, removes its clips from R2 and from HeyGen, and makes every later cache lookup miss (§14).
- **Disclosure.** Every clip is labelled AI-generated (§13).
- **Fish voice.** Using the Voice Tutor's pinned Fish narrator (`reference_id 802e3bc2…`) as the avatar's audio (`audio_url` input, §18) also needs the Fish voice's licence checked for distributed video. That is already a Motion V1 §34 release item.

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

What HeyGen offers, per its docs on 2026-10-04 (§31):
- **Pronunciation:** a Brand Glossary of respellings ("`hey-jen`"; no IPA or phonemes), passed as `brand_glossary_id`.
- **Pauses:** `<break>` tags only.
- **Your own audio:** `audio_url` or `audio_asset_id` (MP3/WAV, up to 32 MB), which are "mutually exclusive with `script`". This lets the avatar lip-sync the Voice Tutor's own Fish narrator.
  - In that case the provider receives audio of the same script, which is no extra private data.
  - The Fish call is a second paid call under the same confirmation.
  - Whether WebM alpha works with `audio_url` is UNVERIFIED.

---

# 19. UX

Avatar clips should not unexpectedly hijack the learning experience.

Guidelines:
- short,
- skippable,
- no autoplay with sound unless current product policy explicitly allows it (it does not: paid narration "never autoplays", `docs/features/learn-artifact-generation.md`; in V1 a clip plays only from the learner's click),
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

In V1, "play/show" and "show proposal" are both reached through the chip in §4.1, never automatically. Whether a cached clip may later show without a click is an owner decision (§32).

---

# 21. Development prototype set

Prototype at least four clips.

## A. Course greeting

Purpose:
`section_greeting`

Example goal:
"Welcome the learner to Attention and explain what question the section answers."

Target:
~6–10 seconds.

## B. Section transition

Purpose:
`section_transition`

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
`course_completion`

Example:
"You've finished this section. Next, try explaining how causal masking and softmax work together."

Target:
~6–10 seconds.

Compare where available:
- Avatar V (documented for digital twins only, so it needs the owned twin of §17),
- Avatar IV (stock studio avatars and digital twins),
- opaque MP4,
- transparent WebM (needs a matting-trained look),
- HeyGen TTS voice vs the Fish narrator through `audio_url` (§18).

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

**Status: done by this reconciliation** (§30, §31). Every later milestone is development only, and each has its own GO (§32).

## AV1 — MCP prototypes

Using HeyGen MCP in development only:
- generate prototype A–D,
- compare quality,
- inspect transparent output,
- record cost/latency.

No Rabbit Hole production integration.

Paid: MCP spends the HeyGen web plan's credits (§10). It needs the owner's GO with a credit ceiling, a Rabbit Hole-owned account, and training opted out (§16). Fixture scripts only. Report: the §22 review per clip, latency, credits, and alpha edges in Chrome and in Safari.

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

Model calls run under the existing dev model configuration. There is no provider call.

## AV3 — provider adapter

Implement:
- AvatarProvider,
- HeyGenAvatarProvider,
- submit/poll/download,
- normalized error handling.

Dev only.

- It is v3 only (§9), env-gated (`LEARN_AVATAR_PROVIDER`, `HEYGEN_API_KEY`), and built under `paidRefusal`.
- Tests use a stubbed transport: unconfirmed is 428 with no call, a lost response becomes `uncertain`, there is no resubmission, the host and content type are checked, and every error category is covered.
- The first real HeyGen REST call needs a separate owner GO.

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

## AV5 — canvas playback

- normal avatar video card,
- optional transparent overlay prototype,
- captions/skip/accessibility.

It also includes:
- the `operation.op: avatar_clip` card with its own copy and the AI-generated label;
- the PiP fallback and WebKit detection (§11);
- the reload-resume fix (`paid-persist-8`, §13);
- the build deployed to this worktree's own dev clone for visual review (`rabbit-hole-web-dev-avatar-teacher-v1-spec`), never the shared dev Worker.

## AV6 — Tutor suggestion flow

Tutor:
- recognizes approved moments,
- emits provider-independent `show_avatar_message`,
- never silently spends money.

The action contract, router rows, validator stages, chip and proposal are in §4.1. It sits behind the off-by-default `TUTOR_AVATAR` knob. Golden-trace tests check that typed and voice turns are byte-identical while the knob is off. It needs the owner's sign-off on the Tutor contract change and a Tutor benchmark re-run before the knob is turned on.

## AV7 — Motion composition prototype

Combine:
- avatar intro,
- Motion technical segment,
- avatar takeaway.

Still dev only.

It starts after Motion M7A and AV4, under the §12 boundary, with the cached clip as a deterministic asset. Any change it needs on the Motion side goes through the Motion branch's owner.

## AV8 — quality/cost benchmark

Compare:
- Avatar IV,
- Avatar V,
- transparent/opaque,
- cache behavior,
- latency/cost,
- visual/pedagogical quality.

It adds Avatar III as a cost reference and HeyGen voice vs the Fish narrator. Paid: it needs its own GO.

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
13. provenance identifies provider/avatar/voice/config used.

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
→ show_avatar_message
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
| 1 | The Tutor has no generation action and no paid tools. `generate_artifact`, `suggest_motion` and the paid-tool UX are an open decision. The planner prompt says "never generate new artifacts". | `tutor-v1-locked-decisions.md:206, 249, 260, 496-503, 553`; `agents/learn-tutor.js:176` | `show_avatar_message` is a chip-only suggestion that never starts anything. It sits behind the off-by-default `TUTOR_AVATAR` knob and needs the owner's sign-off as the avatar-only resolution of that open item (§4.1). |
| 2 | The action field `purpose` collides with the planner tool's existing `purpose` enum for `ask_question`. | `agents/learn-tutor.js:154` | The Tutor field is `moment`; the brief keeps `purpose` (§4.1). |
| 3 | Purposes assume section and course-completion state that the Tutor does not have. | `learn-tutor-evidence.js:1-23` (session-only store); `learn-tutor.js:144-177` (router rows) | Each purpose is mapped to a real signal; `section_greeting` and `course_completion` are prototype-only in V1 (§3). |
| 4 | `content_goal` and `context_refs` are free text from the planner: a path for learner words into the Director and provider, and a cache breaker. | §4 draft vs §16 draft | Dropped in V1. Registry concept ids only (§4.1, §5.1). |
| 5 | `completed_topics`, and the examples "you've got causal masking" and "You can now explain…", are mastery claims. | `agents/learn-tutor.js:181`; `adaptive-tutor-v1.md:43` (T1) | Concept ids plus a `personalization` switch, `no_mastery_claims`, and the examples rewritten (§2, §6, §7, §21). |
| 6 | Opus 5.5 rejects a forced `tool_choice`, and the artifact path forces `any`. | `agents/learn-tutor.js:215-217`; `learn-artifact.js:53`; Motion V1 §4.9 | The Director uses `auto`, harness validation and one schema re-ask; the planner stays `auto` (§4.1, §5.1). |
| 7 | The cache key uses `final_script`, but the Director is a model, so two learners would get two scripts and two paid renders. | §14 draft | A script-slot key comes first, then the render key (§14). |
| 8 | Sharing a greeting across learners conflicts with LearnVideos, which is per learner. | `learn-video.js:26-27` | A `public_course` scope Durable Object, alongside the unchanged per-learner LearnVideos (§14). |
| 9 | The draft assumes video metadata `video_kind: motion \| avatar`; the code tells video blocks apart by `operation.op`. | `learn-video.js:64-66`; `motion_render` on `feature/motion-v1-harness` | `operation.op: avatar_clip` plus an `avatar_clip` provenance object (§13). |
| 10 | LearnVideos hard-codes MP4, so WebM alpha would be served as `video/mp4`. | `learn-video.js:42, 117-118, 135-136` | The job stores its real `contentType` (§13, AV4). |
| 11 | The draft's provider method list duplicates an existing contract. | `video-provider.js:1-8`; `math-provider.js`; Motion V1 §18 | Reuse `submit → ticket`, `poll → null \| result`; the job runner owns download and storage (§8). |
| 12 | A paid video card never resumes after reload. | `LearningBlocks.jsx:1366-1389`; `learn-cleanup.md:193` (`paid-persist-8`) | AV5 lands after the fix or carries it (§13). |
| 13 | "Cached clip → may play immediately" conflicts with the no-autoplay rule and with the Tutor's chip authority. | `learn-artifact-generation.md:102-104`; `tutor-v1-locked-decisions.md:255-266` | Chip only; it plays from the learner's click (§4.1, §19, §20). |
| 14 | The draft is silent on canvas skeletons for paid work. | `canvas-skeleton-cards.md:7, 41-54` on `ui/canvas-skeleton-cards` | No skeleton at the chip or proposal; Generate reserves the slot (§15). |
| 15 | The draft's "credits flow" does not exist on main. | `feature/usage-credits` (revision 3, unmerged); `learn-paid.js` | Development uses the confirmation gate only; production waits for Usage & Credits (§15, AV9). |
| 16 | "Production deferred" had no mechanism, yet production reuses every development route. | `rabbit-hole-production.md`, "Production entry" (`app-worker.js` reuses `dev-worker.js`) | An env-gated provider; no key on `rabbit-hole-app` before AV9 (§8, §9). |
| 17 | HeyGen v1 and v2 (including `/v2/video/generate` and `/v1/video.webm`) sunset on 2026-10-31. | §31 | v3 only (§9). |
| 18 | The draft treated MCP as free exploration; it spends HeyGen plan credits. | §31 | AV1 needs a paid GO with a ceiling (§10). |
| 19 | Avatar V is documented for digital twins only, so stock avatars cannot use it. | §31 | The engine is chosen per profile; Avatar V needs the owned twin (§9, §21). |
| 20 | Safari ignores WebM alpha. | §31 | PiP fallback, with the overlay off on WebKit (§11). |
| 21 | Body motion is not a general control: `motion_prompt` is documented for photo avatars only. | §31 | `motion_direction` is optional and used only where supported (§6). |
| 22 | The Learner Intent Resolver is the shared input for specialists, but V1 avatar clips are learner-agnostic. | `adaptive-tutor-v1.md:502-664` | The V1 Director takes no LearnerTurn: the Tutor, which reads the turn, picks the moment. Personalized clips will consume the Resolver's bounded LearnerTurn (pointer added there). |
| 23 | "Avatar" already means the profile picture in code. | `profile.js:8-48`; `learn-migrations/0002-user-profiles.sql:7` | Identifiers are `avatar_clip`, `learn-avatar/`, `AvatarBrief`; `/api/profile` is untouched. |
| 24 | An early product plan lists "Talking-head avatar" as a v1 non-goal. | `docs/02-how-we-will-build-it (1).md:15, 115` | Historical. This spec governs the avatar teacher; that file is not edited. |
| 25 | Stale bucket names in other docs, not edited here: Motion V1 §32 names `small-learn-media-dev`, and the storage table says production has no `LEARN_MEDIA`. | `rabbit-hole-motion-v1-harness-spec.md` §32; `learn-artifact-generation.md:163-164` vs `packages/web/wrangler.dev.jsonc:77-79` (`rabbit-hole-dev-learn-media`) and `wrangler.rabbit-hole-prod.jsonc:38` (`rabbit-hole-prod-learn-media`) | This spec uses the real bucket names. The other docs are left for their owners. |
| 26 | New names were needed. | `CLAUDE.md:34` (`rabbit-hole-*`, never `small-*`) | No new Cloudflare or Fly resource. New names: secret `HEYGEN_API_KEY` and var `LEARN_AVATAR_PROVIDER` (none exists today), R2 prefix `learn-avatar/`, dev clone `rabbit-hole-web-dev-avatar-teacher-v1-spec`. |

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
| Pricing | The self-serve API is pay-as-you-go, "separate from our regular HeyGen plans", starting at $5; credits expire after 12 months. Enterprise: 1 credit = $0.50; Avatar IV and V 0.1 credit/s (about $0.05/s, $3/min, derived); Avatar III 0.0167–0.0433 credit/s; no published webm or 4K surcharge. | https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained, https://www.heygen.com/faq, https://developers.heygen.com/docs/enterprise-pricing.md |
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

**Authorized by this document:** AV0 only (this reconciliation). The status at the top still holds: architecture and development spec only.

**Ready on the owner's GO, development only, with no paid provider call:**
- **AV2:** AvatarBrief, Director, script review and the script-slot cache, under the existing dev model configuration.
- **AV3:** the HeyGen v3 adapter against a stubbed transport.
- **AV4:** storage, cache and scopes.
- **AV5:** the canvas card, the PiP fallback and reload-resume, deployed only to this worktree's own dev clone for review.

**Needs a separate typed GO:**
- AV1: MCP prototypes, which spend HeyGen plan credits;
- the first real HeyGen REST call in AV3;
- AV8: the benchmark;
- AV6: the Tutor contract change, its knob turned on, and a Tutor benchmark re-run;
- AV7: after Motion M7A.

**Still deferred:**
- AV9: production on digrabbithole.com. It waits for Usage & Credits, legal and privacy review, cost caps and the production GO.
- Live Avatar.
- Personalized or learner-requested free-form clips, including `content_goal`.
- A Tutor trigger for `section_greeting` and `course_completion`.
- Learner-created avatars and any voice cloning beyond the consenting owner.
- Webhooks.
- The chroma-key and Safari HEVC-alpha transcodes.
- An avatar slash command.

**Owner decisions:**
1. Approve `show_avatar_message` (chip only, behind `TUTOR_AVATAR`) as the avatar-only resolution of the Tutor's open paid-tool item, and decide whether the name stays `show_…` or becomes `suggest_avatar_message` to match the other suggestion actions.
2. Avatar identity for V1: a HeyGen stock studio avatar, which works with Avatar IV, or a Rabbit Hole-owned digital twin of a consenting adult, which Avatar V needs and which requires HeyGen's consent flow. If a twin, whose likeness.
3. Voice: HeyGen TTS, or the Voice Tutor's Fish narrator through `audio_url` (two paid calls, and the Fish licence for video).
4. Who pays for a shared `public_course` clip: the first learner who confirms, or Rabbit Hole pre-warming every shared slot.
5. Whether a cached clip may ever show without a click (V1: never).
6. No avatar suggestion on voice turns in V1: confirm.
7. A Rabbit Hole-owned HeyGen account, with a training opt-out, and the credit ceiling for AV1.
8. Whether AV5 waits for Learn cleanup U8's `paid-persist-8` fix or carries it.
