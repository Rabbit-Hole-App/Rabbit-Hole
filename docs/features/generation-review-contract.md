# Generation review contract (UI-15.1)

Status: Release 1, written 2026-10-23 by lane `ui15-contract` (branch `feat/ui15-contract`). Owner briefs: UI-15.1 and the owner
schema spec of the same day (binding). This document is the single description of how every generation feature asks the person to
review and approve what will be made. Other lanes build against it and do not edit the files it names as owned.

## 1. One workflow, one schema, one renderer

Attach or select cards and describe the result, then Chat prepares an enhanced editable prompt, the person reviews the prompt,
references and the settings that apply, confirms, and only then does generation start. Adding a command's confirmation fields is ONE
declaration in `packages/web/src/generation-confirmation-schema.js` plus the command's execution adapter. No custom confirmation
form, no second copy of field rules.

Files (owned by this lane; others import, never edit):

| File | What it is |
|---|---|
| `packages/web/src/generation-confirmation-schema.js` | THE canonical schema: common proposal structure, per-command definitions, review policy, common field validation, allowed actions. No imports (a unit test enforces it). |
| `packages/web/src/generation-review.js` | Pure, web and server importable: the pill grammar, reference shapes, the review validator, the canonical form and hash, edits, reference states. |
| `packages/control-plane/src/generation-proposal.js` | Signing, the v3 envelope, revisions, the one-shot consume. |
| `packages/web/src/generation-review-client.js` | Thin client API (fetch, edit, check, confirm) for the renderer. No UI. |

## 2. The logical proposal (what a card draws)

```
GenerationProposal = {
  schema_version: number,         // the FORMAT of this structure (SCHEMA_VERSION = 1)
  proposal_id: string,
  revision: number,               // an edit to ONE proposal; the envelope's `version`
  command: string,
  original_request: string,       // read only, exact, never rewritten by any edit
  title: string,
  description: string,            // the editable proposed instructions; carries reference pills (section 4)
  settings: Record<string, unknown>,   // {} when the command has none
  references: Reference[],
  requirements: string[], assumptions: string[], missing_information: string[], limitations: string[],
  review: { required: boolean, reasons: string[] },
  usage?: { estimate_credits: number, quote_id?: string, expires_at?: string },
  status: 'awaiting_review'|'needs_input'|'preparing'|'generating'|'completed'|'failed'|'cancelled'|'superseded'|'expired',
  validation_errors: { path: string, message: string }[],
  allowed_actions: string[]       // edit, save, generate, cancel
}
Reference = { id, label, kind, sourceId, revision, range }   // section 4
```

`proposalView(envelope, resolved)` in the schema file builds it from a signed envelope plus what the SERVER resolved (status,
validation errors, review decision, quote). Empty lists and `{}` are hidden by the renderer (`visibleSections`). Ownership, canvas
and job binding, signature or hash, expiry and idempotency metadata stay beside this structure in the envelope: never editable,
never model controlled.

Envelope names versus logical names: the envelope's `version` is `revision`; the envelope's `prompt` (with pill tokens) is the
logical `description`; the envelope's `description` is the same text with each pill replaced by its label (for older cards and
for executors that take plain text), and a v3 envelope is only valid when the two agree.

## 3. Command definitions (the schema file)

```
CommandDefinition = { review_policy: 'always'|'conditional'|'none', editable_fields: string[], settings: FieldDefinition[], sections: string[], ...label, noun, flag, cancel }
FieldDefinition   = { key, label, type: 'text'|'textarea'|'number'|'integer'|'select'|'boolean'|'string_list'|'parameter_group',
                      required, editable, default?, options?: {value,label}[], min?, max?, step?, max_length?, unit?, available?, unavailable_reason? }
```

- `review_policy` is separate from settings: an empty `settings: []` never means "no confirmation". `always`: every request is
  approved. `conditional`: the SERVER decides per request and says why in `review.reasons` (Explain's brief thresholds, CAD's
  brief-first flag). `none`: a free immediate card. A command with no definition is `always` (fail closed), and a conditional
  command with no server answer is required. A model's output can never change any of this (`reviewFor`).
- Field validation derived from the declarations (`validateSettings`, `fieldProblem`) is the common rule set: type, required,
  min, max, step, options, length, unavailable. Deeper capability checks stay in the existing handler (a CAD parameter's
  constraints through `groups['cad-parameters']`, a provider's accepted sizes through server `options_from`).
- `available: false` shows the control disabled with `unavailable_reason`; the value must be absent or the default.
- `options_from: 'server'` means the server resolves the options (image models and what each accepts); a field with none resolved
  is not selectable. IMG-01 declares only what its provider really supports.

| Command | review_policy | Settings declared | Sections | Notes |
|---|---|---|---|---|
| motion | always | aspect_ratio (disabled until the renderer reports its ratios), duration_seconds (select, 5 to 60 in steps of 5, seconds, required), audio (disabled, Narration coming soon) | references, usage | no Cancel (an unanswered proposal starts nothing) |
| explain | conditional | presentation: static, steps, time, experiment | references, assumptions, usage | no duration or audio |
| cad | conditional | units (read only), parameters (parameter_group) | references, requirements, assumptions, missing_information, limitations, usage | units and the parameter list need a new brief; values do not |
| generate-image | always, flag IMAGE_GENERATION (off) | model (four, below), then only what that model supports: quality, aspect_ratio, resolution | references, usage | adoption stubs only |
| video, 3d, animate | always | none | usage (and references) | confirmation migrates later |
| flashcards, code, graph, diagram, image, compare, walkthrough | none | none | none | free immediate cards |

Image models (owner 2026-10-23; ids verified in the IMG-01 audit section H1): `gpt-image-2.5-sunburst` (GPT Image 2.5 Sunburst),
`gpt-image-2.5-flare` (GPT Image 2.5 Flare), `gemini-nano-banana-2.1` (Nano Banana 2.1), `gemini-3-pro-image` (Nano Banana Pro).
`IMAGE_MODELS` in the schema file states, per model, what the provider page states: OpenAI pair quality auto, low, medium, high, xhigh,
max and the common sizes (ratios 1:1, 3:2, 2:3, 16:9, 9:16 at the resolutions that exist for each, `OPENAI_SIZES`; 4K marked
experimental); Google pair resolutions 1K, 2K, 4K, 14 ratios for 2.1 and 10 for Pro, no quality. Fields that depend on the model
use `by_model`, so `fieldsFor(command, settings)` and `settingsProblems` are one pure function of the selected model for web and
server. Before a model is chosen only the model field shows; no model is chosen or substituted for the person. Changing the model
never drops a value: a setting the new model does not support, a ratio or pair it cannot make, or more references than it takes
come back as `validation_errors` with paths (`settings.quality`, `settings.resolution`, `references`) and Generate stays
blocked until the person fixes them. Reference images are `references` of kind image or file, at most `max_references` per model
(14 for Google; 4 for OpenAI, a conservative cap because the docs state no maximum). The price is the server's quote
(`requires_quote`): with none, the view carries `usage: { estimate_credits: null, unknown: true }`, a `usage` validation error and
no Generate; an explicit quoted 0 is a quote. The chosen model and settings live in the signed `settings`, so they persist through
save, reload and regeneration. The job substrate is the separate `feat/image-jobs` lane (ImageJobs Durable Object); this lane
builds no job execution.

Unresolved provider limits and pricing (reported, not guessed; audit H1 and shutdown-and-storage.md section 2.5): OpenAI output
tokens per quality and size (no quote possible yet), OpenAI maximum reference images and accepted formats, OpenAI default output
format, Organization Verification and key presence; Gemini input-image size and format limits, `n > 1`, thinking tokens inside the
published per-image figure, the 2.1 character-reference limit (the pages say 4 or 5: 4 is used) and Nano Banana 2.1 4K price
(published and token-derived figures disagree). All four models therefore have `pricing_verified: false`.

Motion duration: the schema declares the owner's exact set (5, 10, ..., 60). The renderer today clamps to 30
(`learn-render/motion/duration.js` DURATION); lane `feat/motion-settings` raises it and verifies actual output. Do not release the
schema's 60 before that lane merges.

## 4. References and the inline pill grammar

A reference is `{ id, label, kind, sourceId, revision, range }`. `id` is the pill's stable id inside this proposal, `label` is shown
("CAD · Roller assembly"; two cards with one title stay distinct because they bind by `sourceId` and `revision`, never by label),
`kind` is a ContextRef kind, `revision` is the source revision (a `file:` source's own sha256, otherwise the card or source
version), and `range` is the ContextRef range or null. At most 8 references; the same part of one source cannot appear twice.

The prompt text carries a pill as the token `{{ref:<id>}}`. Text outside tokens escapes a backslash as `\\` and a brace as `\{`.
Therefore a token is never produced by, and never collides with, anything typed: `parsePrompt(serializePrompt(s)) === s` for every
`s`, a literal `{{ref:r1}}` typed by the person is stored as `\{\{ref:r1}}` and renders as text, and an unescaped brace that is not
a whole token is a `prompt_syntax` error with its position. Rules the validator enforces both ways: every token names an attached
reference, and every attached reference is used by at least one token (an unused reference is a hidden input). A prompt needs
words, not only pills.

Rendering (the pill editor lane): `promptSegments(prompt, references)` yields text and pill segments, each pill carrying its whole
reference. A pill shows the type icon and the label; clicking, Enter or a tap focuses or opens the ORIGINAL card and never submits;
the confirmation draft stays open. `removeReference(fields, id)` removes the reference from the list and its pills from the prompt
together (the label stays as plain words so the sentence still reads, or vanishes with `asLabel: false`).
`referenceFromContextRef(ref, id, typeLabel)` builds a reference from an attached chip; a chip with no revision to bind to is
refused with a message, never attached unbound.

## 5. The canonical form and hash approval binds to

`canonicalReview(fields)` is a JSON array in fixed order: format tag, command, mode, original request, title, prompt (with tokens),
visual constraints, references (`id, label, kind, sourceId, revision, range`, in list order), the four string lists, settings with
sorted keys, destination `[org, app]`, quote or null. `reviewHash(fields)` is its SHA-256 (hex). Proposal id and revision are the
envelope's, signed with it, so equal content hashes equal. Anything the person approved changes the hash: prompt, a pill's source or
revision, order, settings, destination, quote, lists.

## 6. Envelope versions and signing

- v1 (Motion only) and v2 keep validating exactly as today; live proposals stay consumable for their 24 hour life.
- v3 (signature prefix `v3.`, its own HMAC label) signs the v2 fields plus `schema_version, mode, original_request, prompt,
  visual_constraints, references, requirements, assumptions, missing_information, limitations, destination, quote, review_hash`.
  Verification recomputes `review_hash` from the fields and requires `description` to equal the pill-free rendering of `prompt`.
  `usage` (display) stays unsigned. v2 `source_refs` stay as they were (display names the model chose); `references` are the
  new, revision-bound, content-carrying ones.
- A v2 proposal is a review with the model description as its prompt and no references (`reviewOf`). The first edit of a v2
  proposal produces a v3 revision of the same proposal id.
- Rollback note: a worker without v3 refuses v3 proposals ("not made for you"); they expire within 24 hours.

## 7. Editing, saving and approval

`PUT /api/learn/chat/messages/:id/proposal` accepts `{ expected_version, settings?, prompt?, title?, references?, requirements?,
assumptions?, missing_information?, limitations?, visual_constraints? }`. Rules:

1. Only keys the command's `editable_fields` list can change; `original_request`, command, mode, destination, quote and ids never
   change, and a read-only key is refused by name (`firstReadOnly`).
2. The body is applied to the SERVER's current revision (never a browser copy), validated (`applyEdit` for the review,
   `validateSettings` for settings), re-signed as the next revision (v3) and published through the same compare-and-swap as chat
   refinements (`saveRevision`). A stale `expected_version`, a lost race or a used proposal is a 409 with the current proposal; the
   browser keeps the person's draft beside it.
3. Saving makes no model call. A change that needs a new plan or price (the command says so) marks `status: 'preparing'` or
   invalidates the quote; Generate stays disabled against the old approval until refreshed.
4. The response carries `references: [{ id, label, state, message }]` with `state` one of ok, changed, deleted, inaccessible,
   unsupported. A blocked review is saved (the draft is never dropped) and flagged.
5. Generate runs ONLY the saved, current, valid revision, with nothing in `missing_information`, and no unsaved edits.

Approval binds to the signature of the current revision (prompt, references with revisions, settings, destination, quote). Execution
reads ONLY the verified, consumed proposal; text a client resends is compared by signature, never used as input.

## 8. Reference resolution before dispatch

Before the one-shot consume, the server re-resolves each reference under the requester's access (`authorizeFileSource`,
`resolveExplainRefs` for code and files, per-kind resolvers elsewhere) and classifies it: `deleted` (gone), `inaccessible` (no
longer permitted; every refusal looks alike), `changed` (revision differs), `unsupported` (this generator cannot use that kind),
`ok`. Any state but ok returns 409 `reference_blocked` with the states BEFORE anything is reserved or consumed; the proposal stays
current. No reference is silently omitted or the list truncated. A kind with no resolver yet returns `unsupported`. The generator
receives the actual source content (the image provider the authorized bytes, a CAD workflow the structured model information it
supports), never pill labels.

## 9. Duplicate submission and recovery

One press, one job: the card disables Generate on the first click and keeps one in-flight call per proposal (`confirmProposal`);
the server consumes the proposal once, keyed by the press (`consumeProposal`), and a repeat with the same key is idempotent while a
different key is `proposal_used`. Allowance admission, reservations and the job engines' own idempotency are unchanged.

## 10. What each generator sends and consumes, and Release 1 adoption

| Generator | Old confirmation | New path (Release 1) | Executes |
|---|---|---|---|
| motion | proposal card (v2) | shared card, v3, schema fields | `approvedProposal`: the approved prompt rendered with labels is the Director's description; duration from settings; references empty or `unsupported` |
| explain | proposal card posted by the brief stage; Generate blocked because the card required Motion's output-card adapter | shared card; Generate approves the existing job; conditional review stays the server's | after consume, the job authors from the approved prompt and settings, and from resolved reference text |
| cad | `PaidConfirm` (consent before the paid brief), then `CadReview` when CAD_BRIEF_FIRST | `PaidConfirm` stays as the consent only where a paid brief is prepared; the brief renders through the shared card (`description`, requirements, assumptions, missing information, limitations, parameters) | the job's `briefHash` approval is unchanged; the hash is also recorded as the review hash |
| generate-image | none (flag off) | declared in the schema; adoption stub behind IMAGE_GENERATION | IMG-01 builds the executor on `references` and `server options` |
| video, 3d, animate | `PaidConfirm` with the raw line | deferred: they author a block the person never sees, so they need a prepare step first (largest change); declared in the schema now | unchanged |
| flashcards, code, graph, diagram, image search | none | none by policy | unchanged |

Recommendation: Motion and Explain first through the proposal framework (they already sign proposals); CAD binds through its job
`briefHash` rather than being converted to a proposal (its job is the stored state); video, 3d and animate are deferred because they
have no planning step to review.

## 11. Compatibility

Old proposals (v1, v2), stored chat history, pending jobs, the card's `settingsConflict` flow, and every existing signature or hash
(`briefHash`, `brief_hash`, proposal `sig`) keep working. Nothing is removed until all its callers are migrated; obsolete code and
tests are deleted only then, in the cleanup commit, with the matrix in the hand-back.
