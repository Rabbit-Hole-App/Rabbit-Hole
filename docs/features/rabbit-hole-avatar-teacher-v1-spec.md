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

"Nice — you've got causal masking. Next we'll look at how softmax turns the remaining scores into weights."

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

---

# 6. AvatarBrief

Define one canonical structured request.

Conceptual V1 schema:

```text
AvatarBrief
{
  id
  purpose

  learner_context {
    completed_topics[]
    current_topic?
    next_topic?
  }

  teaching_goal
  source_refs[]

  duration_seconds

  script_constraints {
    max_sentences
    plain_speech
    no_code
    no_equations
    no_unverified_claims
    no_internal_tutor_language
  }

  must_say[]
  must_not_claim[]

  tone
  avatar_profile
  voice_profile
  framing
  expressiveness
  motion_direction?
  background_mode
  output_format

  provenance
  provider_preferences?
}
```

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
- no awkward phrases such as "according to my learner-state representation".

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

---

# 19. UX

Avatar clips should not unexpectedly hijack the learning experience.

Guidelines:
- short,
- skippable,
- no autoplay with sound unless current product policy explicitly allows it,
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
"You've finished this section. You can now explain how causal masking and softmax work together."

Target:
~6–10 seconds.

Compare where available:
- Avatar V,
- Avatar IV,
- opaque MP4,
- transparent WebM.

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

## AV1 — MCP prototypes

Using HeyGen MCP in development only:
- generate prototype A–D,
- compare quality,
- inspect transparent output,
- record cost/latency.

No Rabbit Hole production integration.

## AV2 — AvatarBrief + Avatar Director

Implement:
- schema,
- script generation,
- source grounding,
- Tutor-purpose mapping.

No provider call required initially.

## AV3 — provider adapter

Implement:
- AvatarProvider,
- HeyGenAvatarProvider,
- submit/poll/download,
- normalized error handling.

Dev only.

## AV4 — storage/cache

- download result,
- LEARN_MEDIA,
- LearnVideos/video metadata,
- deterministic cache.

## AV5 — canvas playback

- normal avatar video card,
- optional transparent overlay prototype,
- captions/skip/accessibility.

## AV6 — Tutor suggestion flow

Tutor:
- recognizes approved moments,
- emits provider-independent `show_avatar_message`,
- never silently spends money.

## AV7 — Motion composition prototype

Combine:
- avatar intro,
- Motion technical segment,
- avatar takeaway.

Still dev only.

## AV8 — quality/cost benchmark

Compare:
- Avatar IV,
- Avatar V,
- transparent/opaque,
- cache behavior,
- latency/cost,
- visual/pedagogical quality.

## AV9 — production rollout

Deferred until:
- payment/credits are ready,
- provider/privacy review complete,
- avatar consent/legal review complete,
- cost limits set,
- production acceptance tests pass.

---

# 27. Acceptance criteria for development V1

A successful Avatar Teacher development prototype demonstrates:

1. one structured AvatarBrief,
2. grounded 1–2 sentence script,
3. HeyGen generation succeeds,
4. output is downloaded into Rabbit Hole-controlled storage,
5. normal video playback works,
6. transparent WebM works for at least one eligible avatar if supported,
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
