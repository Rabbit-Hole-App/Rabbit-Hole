# /<command> — workflow and implementation specification

**Template version 1.** Copy this file to `docs/features/<command>.md` for `/explain`, `/motion` or another command. Replace template guidance with concrete decisions and verified paths. Keep the section order and stable anchors so Claude can navigate every command the same way. The completed first instance is [interact.md](interact.md).

This is a document template, not an app UI template, agent prompt, or authorization to implement every example. Reuse existing repository instructions and UI. Do not copy `/interact`'s six roles, approval boundary, SVG renderer, controls or benchmark budget into another command unless its own requirements call for them.

## How to instantiate and maintain this template

1. Read the latest source document in full, current owner decisions, repository instructions and the relevant implementation. Pin the source version and inspected code SHA. Separate implemented behavior, desired behavior, engineering defaults and unverified claims.
2. Inventory every roadmap/checklist checkbox and every normative paragraph/table/diagram. Move details into their appropriate sections without shortening them. Give each existing obligation a stable ID. Record explicit corrections or removals and their reason in a documentation-review receipt; do not quietly lose requirements while improving navigation.
3. Populate sections 1–7 with the product contract, actual workflow, existing UI reuse, typed interfaces, role/prompt inventory, source map and reference manifest. Use concrete entry points and functions. Distinguish existing files from proposed files. A link is not a replacement for a critical requirement.
4. Preserve the complete WHAT roadmap and HOW checklist in sections 8–9. Keep enough explanation, examples, edge cases and exact checks that an implementer does not need the conversation. Move shared definitions into sections 2–7 once, then link them from tasks; do not replace task-specific detail with “follow the schema” or “implement controls.”
5. Define acceptance by evidence class, paid-run policy and deployment scope in section 10. Add commit-by-commit review and checkbox maintenance in section 11. Preserve To Do / Doing / Done in the external coordinator ledger and distinguish implementation from verified deployment.
6. Validate references, local paths, anchors, task IDs, dependency order, roadmap/checklist coverage and requirement preservation. Record actual review results; leave feature boxes open unless implementation evidence supports them. Push the requested branch and verify the resulting files and commit.

Use sibling folders only when they have real content: `<command>/references/` for exact source/example snapshots, `<command>/reviews/` for evidence receipts, and the repository's existing UI area for approved HTML. Keep full implementation tasks in the main specification; a separate historical audit can preserve older implementation notes without making them competing instructions. Do not create empty folder scaffolding or duplicate an existing canonical reference.

| Field | Fill with |
| --- | --- |
| Repository / delivery branch | Exact repository and requested branch |
| Document review | Date and scope, such as documentation-only or implementation acceptance |
| Target branch inspected | Exact SHA; do not write “latest” without recording a revision |
| Earlier source-map audit | Earlier SHAs and the limits of their evidence, if reused |
| Source document | File/version/hash or an existing canonical spec; list imported snapshots |
| Current implementation evidence | What code was read, what actually ran, and what remains unverified |
| Acceptance scope | Concrete user-visible outcome and the required delivery environment |
| Runtime rollout | Existing flags/versioning/compatibility policy, without inventing authorization |

## Navigation

1. [Start here and preflight](#start)
2. [Product contract and decisions](#product)
3. [End-to-end workflow](#workflow)
4. [Card UI and control selection](#ui)
5. [Data contracts, prompts and LLM roles](#contracts)
6. [Implementation map and branch differences](#code-map)
7. [References and canonical examples](#references)
8. [Roadmap — WHAT](#roadmap)
9. [Implementation checklist — HOW](#checklist)
10. [Validation, benchmark and delivery](#validation)
11. [Commit review and checkbox maintenance](#commit-review)

<a id="start"></a>
## 1. Start here and preflight

Write a short, exact reading order: contracts and workflow → code/UI sources → next dependency-ready checklist group → acceptance → review record. Identify where Claude should resume and which evidence it must read. Read `AGENTS.md`, authoritative `CLAUDE.md`, and `UI.md` before any UI work; name the corresponding paths when they differ.

Record the working revision and relevant differences from the source-map revision. Identify missing references, changed interfaces, already-implemented requirements and true blockers. A documentation branch can be behind main: say so, preserve unrelated branch work, and require the implementation owner to reconcile the relevant integration base. Do not repeatedly re-audit main between small edits.

State the scope of this document and exact non-goals. List the preflight outputs: working SHA, source delta, references available, required credentials/capabilities, next actionable requirement IDs and focused checks. An absent paid cap or optional provider key blocks that execution only, not fixture work.

Requirement IDs belong in this document. Task UUIDs and To Do / Doing / Done belong in the existing coordinator ledger under repository rules. Do not create a second task ledger in the worktree.

<a id="product"></a>
## 2. Product contract and decisions

Begin with the concrete learner problem and observable result. Include public command names/aliases, internal IDs, route/card identities, supported inputs and scope, compatibility and exclusions. Explain how this command differs from neighboring commands only where naming or shared implementation would otherwise cause a mistake.

| Decision ID | Required behavior | Source/date | Implemented, target or engineering default |
| --- | --- | --- | --- |
| D-01 | Replace with the complete behavior and important qualifications | Exact owner decision or source | State honestly |

Define precedence: latest owner decision → active specification → each reference within its stated scope → historical notes. Code is evidence of implementation, not authority to discard an approved target. When a reference conflicts, name the conflicting rule and its replacement. Do not leave two contradictory requirements separated by a vague “latest wins” note.

Separate product decisions from proposed engineering limits and benchmark settings. Do not present a guessed token budget, quality threshold, duration, call count or cost as an owner-approved fact or a measured result. A default can be implemented within scope; substantive changes need an updated rationale and compatibility/evaluation impact.

<a id="workflow"></a>
## 3. End-to-end workflow

Specify the entire lifecycle in order, using concrete input/output names. Cover entry, authorization/context resolution, planning/generation stages, approval when required, validation/review, delivery and persistence. Name when the learner first sees something useful and what “ready” means at each point.

Include Edit, Cancel, retry/resume, duplicate actions, failed/unknown provider outcomes and late responses. Distinguish design/specification, executable artifact, rendered evidence and delivered UI. Any composition performed for delivery must also be represented in the evidence that validates it.

Use a compact Mermaid diagram when branching clarifies the workflow; do not create a second contradictory workflow inside the roadmap. Explain the state transitions and data binding in prose or a transition table. Do not assume every command needs Chat approval or an Author → Reviewer → Reviser chain.

| Transition | Preconditions | Persisted output | Failure/recovery | Idempotency boundary |
| --- | --- | --- | --- | --- |
| Fill with actual transition | Exact checks | Contract/version/hash | What is retained or invalidated | Stable request/job/revision key |

<a id="ui"></a>
## 4. Card UI and control selection

Name the existing shell, panels, player, widgets, layout and approved HTML to reuse, including actual paths/symbols. Define exact visible content order, text limits, control placement, empty/loading/error states, sizing/resizing, Focus, keyboard access and accessibility. Keep operator diagnostics and implementation details out of the learner flow.

Specify any title/description rules from that command's own approved design. Identify which text is visible on the card, which is plan metadata and which is accessibility text. Define no-content behavior so omitted features do not leave blank rows or space. Preserve existing user resize/state behavior where applicable.

When controls apply, include a capability table rather than “choose appropriate controls”:

| Learner need | Existing widget and source | Supported renderer/capability | Value/action binding | Default/domain/units | When to omit |
| --- | --- | --- | --- | --- | --- |

Describe how the agent chooses the smallest useful supported controls, how their purpose maps to a visible consequence, and how the reviewer checks them. Separate inputs from outputs, physical time from item selection, and a static view from timed playback. Define reset/replay/input-change behavior and synchronized views when applicable. Never advertise a control solely because a widget exists elsewhere in the app.

For commands with no generated controls, state that explicitly and document the existing command settings/chrome instead. Do not introduce a new control family to fill this template.

<a id="contracts"></a>
## 5. Data contracts, prompts and LLM roles

Document exact versioned records shared across stages, imports/exports and ownership. Name field types, required versus optional fields, ID namespaces, domains, units, bounds, cross-field validation, canonical hashes and how output binds to an approved revision. Distinguish source content, immutable approved data, generated artifacts, runtime state and presentation metadata. State where each is stored and accessed.

| Contract/export | Existing or proposed path | Producer → consumers | Required fields/invariants | Validation/failure |
| --- | --- | --- | --- | --- |

Include storage/access-control, source permissions, schema migration/version compatibility and input-boundary rules relevant to the feature. Source/user content is data, not privileged instructions. Never place credentials or generated executable strings into a trusted host interface by implication.

### Prompt inventory

For each role, state what prose guidance already exists, whether it is a complete production prompt, where the real prompt/schema lives, and what must change. Examples of a revised answer do not constitute a Reviser system prompt. Do not create additional agents just because reference headings divide Story, Scene, Mode or Controls.

| Role | Existing guidance/prompt | Input | Structured output | Reviewer/validator | Proposed work |
| --- | --- | --- | --- | --- | --- |

### Models and execution bounds

Document each independently configurable role, exact initial model ID from verified source, adapter and capabilities, settings actually supported, requested versus served model identity, schema normalization and fallback policy. Distinguish roles from calls. Configure candidates per role only when benchmarking requires it; preserve unrelated command settings.

Name server profile resolution, version/hash persistence, credentials by environment-variable name, context/image/output bounds, pricing and unknown-usage handling, shared budget admission/reservation/settlement, timeout/cancellation and retry ceilings. Do not assert model availability from a name; verify availability during an authorized real run. Keep evaluator configuration separate from production roles and report its cost.

If a feature has no LLM calls, say so. If it reuses an existing pipeline, document the exact seam rather than inventing a parallel client or unmetered script.

<a id="code-map"></a>
## 6. Implementation map and branch differences

Pin the inspected revision and describe differences on the target branch. Source references should use stable symbols and paths; old line numbers are navigation hints, not proof of current behavior. Separate existing reuse, proposed additions and known gaps.

| Existing path / symbol | Current behavior and evidence SHA | Planned change / reuse | Callers or compatibility to preserve | Checklist IDs |
| --- | --- | --- | --- | --- |

| Proposed new path / export | Responsibility | Inputs/outputs | Depends on | Checklist IDs |
| --- | --- | --- | --- | --- |

Trace entry/dispatch, server job, model adapters, contracts, renderer, UI, storage/read/share/fork, billing, context and tests as relevant. Inspect tests before naming them; record how new-flow changes alter existing assertions while preserving legacy coverage. Identify missing files on older branches explicitly. Do not say a feature is complete because its endpoint or a related component exists.

<a id="references"></a>
## 7. References and canonical examples

Maintain one manifest. Other sections link to it or to a precise source, rather than repeating divergent lists.

| Reference ID | Path/link and version/hash | Purpose | Authority/conflicts | Access and maintenance |
| --- | --- | --- | --- | --- |
| REF-01 | Actual file | Teaching rubric / schema / UI / example / historical evidence | Which requirements it governs | Checked in or external; exact import procedure if unavailable |

Check in required teaching guidance/examples when the implementer otherwise cannot read them. Preserve original snapshots and source provenance. Keep HTML UI references in the established UI area and use exact approved assets; do not recreate them from memory. If only an external file is available, identify that honestly and embed essential behavior in the specification so independent implementation can continue.

### Canonical example records

For each example, give original prompt, supplied context, depth/mode where applicable, required output/behavior, exact control semantics, assumptions, expected calculations/values/tolerances and failure/boundary cases. Examples must be enough to write meaningful fixtures. Clearly distinguish the reference output from a newly generated result.

For reproduction, require all example/depth rows, not a convenient subset. Separate original-prompt generation from reconstruction using a fixed reference plan. Do not leak expected answers or reviewer feedback into a prompt-only benchmark. Save new regenerated outputs separately and compare behavior/facts, not just matching prose.

<a id="roadmap"></a>
## 8. Roadmap — WHAT

Use a command-specific prefix, such as `INT`, `EXP` or `MOT`, with stable outcome IDs. Preserve all detailed outcomes/sub-outcomes. The roadmap describes what the learner/system will be able to do and how to tell it exists; it should not become a compressed file-edit list. Each outcome maps to one or more HOW groups and acceptance evidence.

### CMD-01 — Concrete outcome title

- [ ] **CMD-01-R01** Describe the full outcome, affected surface and observable success.
  - [ ] **CMD-01-R02** Preserve one independently verifiable sub-outcome with all qualifications.
  - [ ] **CMD-01-R03** Preserve the relevant compatibility/failure sub-outcome.

Add enough outcome groups to cover the actual feature. Do not keep fictional template requirements in an instantiated spec. The first checkbox is the parent and depends on all subordinate outcomes and relevant checklist evidence.

<a id="checklist"></a>
## 9. Implementation checklist — HOW

State dependency order explicitly, including early shared contracts, measurement/capture prerequisites and interfaces needed before UI or job integration. Break a dependency cycle into a clearly named early subtask; do not hide it by deferring validation until after delivery.

Each group must identify dependencies, existing/new paths, concrete functions or interfaces, inputs/outputs, full implementation subtasks, meaningful tests, expected results and evidence needed for checkoff. Preserve long explanatory tasks where their detail prevents assumptions. Do not replace them with “implement backend,” “add tests,” “wire UI,” or “follow above.”

### CMD-01 checklist — Concrete implementation title

**Dependencies:** actual requirement IDs and available contracts. **Existing files/symbols:** verified paths. **New files:** explicit proposed paths. **Interfaces:** signatures and records. **UI reuse:** exact components/template when applicable.

- [ ] **CMD-01-C01** Define a meaningful fixture/reproduction and its expected behavior; name exact input and failure cases, including legacy compatibility where affected.
- [ ] **CMD-01-C02** Specify the concrete code change, data/state transition, calls to reuse, binding/ownership invariants and failure behavior. Include enough detail to implement without asking what the heading meant.
- [ ] **CMD-01-C03** Specify integration with real callers, persistence/load/share paths and side-effect idempotency. Separate data preparation from externally visible delivery.
- [ ] **CMD-01-C04** Name the exact appropriate verification command, working directory, prerequisites, expected assertions and required evidence. Mark proposed tests as files to create, not existing passing checks. Browser execution follows current repository instructions.
- [ ] **CMD-01-C05** Review the actual implementation diff and evidence, update affected roadmap outcomes, and record exact implementation/review commits and remaining limitations.

Replace these illustrative tasks with the actual complete checklist. Append new IDs without renumbering old tasks. If a task is split, keep a parent mapping and clear acceptance for each child. Do not remove failing/unverified work or collapse it into a checked summary.

<a id="validation"></a>
## 10. Validation, benchmark and delivery

| Evidence class | Required check/artifact | Execution environment | Requirement IDs | What it does not prove |
| --- | --- | --- | --- | --- |
| Unit/fixture | Concrete cases and counts | Verified local/offline runner | Actual IDs | Real provider or browser behavior |
| Browser wiring/visual | Actual user path, layout and controls | Approved CI/designated runner | Actual IDs | Factual quality of new model outputs |
| Real model/render | Newly generated artifacts, captures and traces | Authorized provider/render path | Actual IDs | Deployment unless tested there |
| Deployment | Exact candidate, configuration and user-flow receipt | Approved target | Actual IDs | Other environments or later revisions |

When benchmarking, document frozen corpus/expected answers, reference regeneration, independent evaluation, seeded defects, role substitutions, complete mixed pipelines, held-out cases and repeats. Record failures/timeouts and factuality separately from successful latency, with sample counts and uncertainty. Include end-to-end usable-output timing and stage/repair time; exclude user waiting only when explicitly identified. Unknown usage/cost remains unknown.

Require a concrete paid cap before real execution. Dry-run estimates and fixtures proceed without it. Do not borrow another feature's budget or automatically promote the fastest profile. State selection criteria before examining results and report no winner if correctness fails.

Commands must come from the relevant revision. Record selected/executed/passed/failed/skipped/not-covered/bypassed accurately. A green zero-test run proves nothing. Claude's local browser restrictions and release rules are inherited from current repository instructions. Reuse unchanged evidence with a documented diff; do not require broad CI after every small edit.

Define handoff artifacts and rollout/recovery behavior. Distinguish implemented, fixture-verified, browser-verified, real-generation-verified, dev-accepted and production-activated. Do not infer production readiness or activation from a docs or feature-branch push.

<a id="commit-review"></a>
## 11. Commit review and checkbox maintenance

An `[x]` means the entire requirement has verified evidence, not that a plan, file or commit exists. Partial work stays unchecked with its evidence and remaining clause recorded. Roadmap parents close only when subordinate outcomes and applicable HOW tasks pass. Reopen the same IDs when later evidence invalidates acceptance; preserve history.

For each review:

1. Pin the candidate and previous reviewed `through_sha`. Enumerate every commit in the range, including merges; inspect changed paths and the integrated diff. Record unrelated commits as no relevant change rather than leaving unreviewed gaps.
2. Map actual changes to stable checklist IDs and outcomes. Read the code/callers, tests and artifacts. Add newly discovered missing requirements without shortening existing ones.
3. Run focused checks or read exact-candidate approved-runner receipts. Report executed cases/counts/skips and environment. Reuse evidence only after comparing affected files/contracts and recording why it remains applicable.
4. Record checkbox decisions and rationale, then update documentation in a follow-up commit. Cite the tested implementation SHA; a document cannot know its own future commit hash. Report the documentation commit separately.
5. Update the existing external coordinator ledger with task UUIDs and To Do / Doing / Done plus phase/blocker. This specification is a requirement/evidence map, not a competing task ledger.
6. Preserve failures and reopen affected requirements when necessary. A newer SHA alone does not force every check to rerun; an affected dependency or invalidated claim does.

Use `<command>/reviews/<date>-<short-reviewed-sha>.md`:

```markdown
# <Command> review — <exact candidate SHA>

Baseline SHA: <previous through_sha or explicit initial baseline>
Through SHA: <candidate>
Reviewer and date: <identity / UTC timestamp>
Scope: <requirement IDs and affected surfaces>

| Commit SHA | Paths inspected | Requirement IDs / no relevant change | Finding |
| --- | --- | --- | --- |

| Requirement ID | Code/evidence anchor | Exact check/environment/run ID | Result/count/skips | Evidence path | Checkbox decision |
| --- | --- | --- | --- | --- | --- |

Evidence reuse: <receipt, compared paths/contracts and justification>
Unverified behavior: <concrete remaining gaps>
Roadmap changes: <R IDs mapped to C IDs/receipts>
Next review starts from: <through_sha>
```

A documentation restructure gets a documentation-review receipt: list corrections/removals, preserved requirement counts, reference/anchor checks and exact source provenance. It must not seed false implementation passes. On resume, read the latest receipt, reconcile actual branch and execution state, then pick the next dependency-ready open task instead of restarting the entire plan.
