# Stepper implementation sequence

Owner instruction: 2026-11-14 12:05 PT. The nine reference cards, their composition sketches, the
[guide](scene-composition-guide.md) and [scorecard](scene-composition-scorecard.md) are approved. The engineering target
is [family-contract.md](family-contract.md). No new planning approval is required.

## Dependencies and ownership

Runtime work starts after Claude Code's one-place `registerFamily` and per-input sign fixes land on
`design/fast-path` and are merged into `design/family-stepper`. Do not implement another registry, fork a shared brief
schema, or work around positive-only fixed inputs. Shared contract/pipeline changes remain Claude Code's lane.
Follow fast-path advances with merge commits, never rebases.

Keep the approved toss/curve HTML shell, font and palette; use the frozen SDK-8 helpers and the existing IndexSlider,
choice and Reset controls. No new SDK helper or renderer change. Deep mitosis is the density ceiling. Grid Overview
references need the one-row rule carried forward, but grid and before/after runtime work waits for stepper acceptance.

## Ordered pushes

1. **Contract merge.** Verify the actual descriptor, numeric-domain policy, family-owned schema/context/check hooks
   and test-selection derivation. Preserve existing toss/curve schemas, words, complete frames, pins and oracles.
2. **Family module.** Declare `FAMILY` depths and admitted canonical compositions, roles for states/regions/links/
   counters, the depth's controls, description, pick criterion, independent step domain, expansion and extraction.
   Overview has navigation only; Standard/Deep add the approved single parameter: Starting array, Lose SYN-ACK or
   Focus. No timeline. Use bounded typed scene data, with exact labels and variant identities.
3. **Parts and assembler.** Implement `step-rail`, `fixed-picture`, `active-callout`, `readouts`, `ghost-previous` and
   `status-line` under `interact-templates/`, each with binding declarations and independent tests. Register the
   algorithm/collection, protocol/parties and phase/cycle compositions as data. Derive drawing source from their
   parts and bindings; the generator makes zero model calls. Preserve geometry and number ownership. TCP status
   copy becomes selected-state data; completed trace/progress belongs to the rail rather than a seventh module.
4. **Invariants.** Check count limits, drawn-region references, active-region names in sentences, a meaningful
   parameter effect, the aha state and its persistent rail selection, and readouts against independent expected
   data. Return bounded structured failures with stable brief paths. Also cover bad anchors, predecessor bindings,
   counter/domain mismatches and first/last boundaries.
5. **Pins and oracles.** Register the Standard plans `stepper-merge-sort`, `stepper-tcp`, `stepper-mitosis` and pin
   family `stepper` through the descriptor. Oracle expectations combine the invariants with independent state/value
   references. Keep all nine depth/composition cases in the round-trip and frame-equality fixtures.

Each numbered implementation deliverable is its own pushed commit, with one paragraph reporting SHA, additions,
executed checks/counts and contract gaps. This preparation document is not a runtime implementation.

## Admission and acceptance cases

| Case | Required evidence |
|---|---|
| Baselines | Toss and curve existing schema/fill-text, round-trip, frame-equality, oracle and template-gate tests pass unchanged. |
| Nine compositions | Extract and expand preserve admitted data and reproduce complete HTML-derived scripted frames, including ids, kinds, labels and readouts at every capture case. |
| Zero-model build | Real registered template/composition path, manifest/source validation, headless run, layout and independent oracle; a model invocation fails the test. |
| Parameter variants | All indices/options, actual picture/readout effects, default restoration, first-state ghost, named disabled boundaries and shorter state-list handling. |
| Six wrong briefs | Isolate count, highlight reference, active-name wording, ineffective parameter, missing aha, and wrong readout. Assert the intended first code/path; do not weaken the schema to admit a malformed negative. |
| Part bindings | Valid ids with wrong anchors/predecessors/counter sources must fail semantically, in addition to unknown-id/type admission tests. |
| SDK budget | Count actual emitted objects, points and source bytes for each worst-case capture; HTML SVG groups alone do not prove the sealed program fits. |
| Fit/live checks | Keep source/fixture evidence distinct from measured 1440 × 900 fit with Chat open, native keyboard behavior and any live fill bench. Clone operation remains coordinated with Claude Code. |

The approved references have variable TCP list lengths: Standard has five/six states, Deep six/eight. The shared
contract/control route must support the actual current list and clamp selection atomically on option changes. Do not
pad the shorter variant with dummy steps, print contradictory rail/control totals, or invent a clock to avoid this.
Verify that seam before committing a runtime family against it; report any unsupported capability precisely.

## Current gate receipt

Fast-path's per-input sign fix landed at `5b56fa253` and has been merged: an input may explicitly declare
`positive`, `nonnegative` or `any`, with existing-family defaults preserved. At that tip `interact-families.js` still
declares its family array by hand; the required one-place registration change has not landed. No stepper runtime
module, parts, invariants or pins have been implemented before this gate.

[The contract preflight](stepper-contract-preflight.md) additionally records the dynamic TCP index-domain seam and
measured limits on faithful primitive lowering. Include these in the shared contract handoff before promising
HTML-derived frame equality; the reference pictures have not been simplified to conceal either issue.
