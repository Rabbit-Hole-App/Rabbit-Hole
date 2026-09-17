# Learn curriculum MVP verification — 2026-09-16

## Curriculum Agent revision: what to teach

This revision supersedes the original curriculum planner described below.
Research and runtime contract: [Curriculum Agent](../features/curriculum-agent.md).
The lesson generator and canvas were retained, with a boundary adapter for the
new subject-matter schema. No saved owner outline was deleted or auto-rebuilt.

Verification: **24 backend/semantic/geometry tests passed; 7 browser scenarios
passed in 23.1 seconds**. New tests cover a dedicated planning/review prompt,
discarding a legacy slide outline as a model seed, no `pages` in new curricula,
required principles and assessment criteria, budget limits, legacy compatibility,
rebuilding from the saved brief, editing subject fields, and approval/reload.

Real model comparison used the same explicitly synthetic image-detector source
for two briefs. Each request used two model calls: draft and review. Results:

| Brief | Units | Allocated time | Draft + review |
|---|---:|---:|---:|
| Underlying concepts; run the app and interpret results; basics; 20 minutes | 4 | 20 min | 125.112 s |
| Maintainers; diagnose S3 failures and safely modify the wrapper; Python/S3/IAM; 20 minutes | 3 | 19 min | 123.931 s |

Conceptual units: what detection claims; confidence and threshold decisions;
running/confirming outputs; interpreting results and limits. Maintenance units:
storage boundaries; failure diagnosis; preserving the wrapper contract. Both
plans include explicit entry assumptions, excluded topics, subject principles,
dependency rationale, and assessment criteria. Neither contains page plans.
This demonstrates sensitivity to the brief in two examples, not a general
quality score or proof of learning effectiveness.

Content review still found overclaims: the conceptual output blurred a JSON
limitation with limitations of all outputs, and both drafts inferred storage
retention from an optional upload. The final prompts were tightened to preserve
per-output scope and keep unknowns unknown across every field. That tightening
was not followed by another model comparison, so no measured improvement is
claimed. Semantic correctness still needs owner review; schema validity and the
agent's own review do not establish it. These calls used `claude-opus-5` selected
by the existing provider; provider configuration was not changed.

Release: shared backend `13344b17-eec0-47c4-bf58-b2453825b316`, regular dev UI
`b1983ca2-4ee4-4900-870b-b13f06baacca`. Live dashboard assets and AWS BYOC
were unchanged. Open Learn → Curriculum → **Rebuild with Curriculum Agent**
for an existing outline. The previous lesson-planning experiment follows as
historical evidence.

## Original curriculum/first-lesson pilot

Scope: regular Small dev, owner interview → draft → review → approval → first
lesson. This is functional verification, not a teaching-quality benchmark.

## Automated checks

| Check | Result |
|---|---|
| Backend/semantic/region tests | 21 passed |
| Learn browser scenarios | 6 passed; final run 20.5 seconds |
| Vite dev build | Passed |
| Worker bundle | Passed; live dashboard assets unchanged |
| Real synthetic course draft + first lesson | Passed twice; final prompt results below |

Commands from the repo root (browser command from `packages/web`):

```text
node --test --test-isolation=none packages/control-plane/test/learn-course.test.js packages/control-plane/test/learn-chat.test.js packages/web/e2e/region-targets.test.mjs
npx playwright test -c playwright.coaching.config.js -g "Learn " --reporter=line
```

Backend cases cover owner-only writes, app access, draft privacy, approved reads,
approval of exactly the saved outline, edit invalidation, stale revisions,
deployment changes, invalid model output, and an edit racing a pending model
response. The generated content is discarded when the saved revision changed.

Browser tests use synthetic APIs: four interview answers, draft review,
reordering, saving, approval, generation, playback, selection-aware questions
whose snapshots pass the server validator, replay without duplicate pages,
reload, and reapproval after edits. The original demo, history, native page
menu, timeline, learner drawings, region targeting, and stale-answer rejection
also pass. Draft and generated-page screenshots were visually reviewed.

Review found and fixed a hidden-canvas sizing issue, duplicate course pages on
repeated generation, and the possibility of requesting a revision while manual
edits were unsaved. The existing demo's short timeline labels were preserved.

## Real model exercise

Used the existing `anthropic` provider helper and documented workspace, with a
synthetic four-line counter function and short runbook. No Amazon data, actual
user sessions, or private app code was used. The same backend handler ran with
in-memory SQLite; these calls did not create a course in a user's app.

Brief: new app users, no programming knowledge, understand the shared counter,
10 minutes. Final prompt run:

| Action | HTTP | Time | Output |
|---|---|---|---|
| Draft curriculum | 200 | 13.964 s | 5 lessons with objectives, page plans, evidence/gaps |
| Approve saved curriculum | 200 | 1 ms | Exact persisted revision approved |
| Generate first lesson | 200 | 19.273 s | 3 validated pages with narration and board blocks |

The first lesson progresses through a shared-tally problem, private notepads
versus a shared board, and the documented app behavior. It includes a question
and recap. Evidence names the supplied runbook/source, and the outline explicitly
marks missing developer rationale. Unknown reset/access/error behavior is
described as undocumented, rather than absent.

The first trial overclaimed that two documented actions were the entire action
set. The prompt was tightened to distinguish partial evidence from exhaustive
knowledge; the second trial explicitly says other buttons/screens may exist.
This does not prove hallucinations are eliminated. The five-lesson outline may
also be too ambitious for ten minutes: owner review remains necessary.

Limitations: two synthetic runs, one app example, no independent accuracy or
learning-outcome scoring. The authenticated UI tests mock the model response;
real model tests exercise the server handler separately. The owner's real
`yolo-s3-job` curriculum has not been generated on their behalf.

## Curriculum deletion and generation feedback — 2026-09-16

Twelve course API tests passed, including owner-only confirmed deletion and a
pending generation that cannot restore a deleted course. Three focused browser
tests passed: course lifecycle, rebuilding with elapsed-time feedback, and
deletion with Cancel, failed-request recovery, preserved learner drawings, and
starting a new course. Browser model responses are mocked.

The dev build passed and its asset URLs match the deployed dev page. Generation
shows an indeterminate progress bar and elapsed time, without claiming a model
percentage or remaining time. Deployed dev UI version:
`ffe7e7e4-ed6b-442d-a8f2-9e7ad52b3e6a`; API version:
`e8af0661-67a7-4aa4-a930-2a3baec9620e`. AWS BYOC was not updated.
