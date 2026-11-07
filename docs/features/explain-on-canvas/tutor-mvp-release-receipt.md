# Tutor MVP release receipt (BE.15 form)

Status: **candidate tested locally; not released; owner manual production acceptance pending.**

## Identity

- Tested code candidate: the tip commit named in the launcher pins (full SHA there) (branch `fix/timing-events`). Later commits on the branch change only this receipt and the routing report's candidate line; they do not change code.
- Production main when this was written: `8deb778fa2b0442b4ac494f9d94e88fffd72a6c3` (the candidate descends from it).
- Handoff docs revision imported (checklist section 1.7): `rabbit-hole/chatgpt/tutor` at `0c73b7bda3bdd5aeb817450229c0a29a807716a2`. Routing fixtures imported at `6b3fff7e1585f6814271f0290d9d91f3bf8e5445` (unchanged in `0c73b7bd`; no main-side fixture edits to reconcile).
- Node 24, lockfile dependencies, Windows. External doubles: every model, JEV, provider, Resend and Sentry call was a test double. Denied egress. No paid call was made.

## Task IDs covered

CORE.02-06 and CORE.09, UI.01-08 (core flows), BE.01a, BE.04, BE.05a, CHAT.01 (complete), CHAT.02 (existing enabled tools, default-off flag), crash containment, crash alerts, timing events, two Chat UI fixes, history entries without dead buttons, canvas tools-gutter safe centring.

R12 (command adapters and per-command prompt suites) is **on hold** by owner decision and is not in this candidate.

## Commands and counts (last full run at 70ed032bc)

| Run | Tests | Pass | Fail | Notes |
| --- | ---: | ---: | ---: | --- |
| `packages/control-plane` `node --test "test/*.test.js"` | 3771 | 3769 | 1 | the failure is `no-ellipsis` (identical line on main `agents/roadmap-check.js:12`); 1 further test not counted as pass or fail by the runner |
| `packages/web` `node --test "src/**/*.test.mjs"` | 5143 | 5116 | 0 | 27 not counted as pass or fail by the runner |
| `scripts/ci/check-map.test.mjs` + `scripts/schema-check.test.mjs` | 29 | 29 | 0 | |
| `npm --prefix packages/web run build` | | | | exit 0 |

Section 8.0 matrix and the new cases (run by the lanes, test doubles only):

- 8.0.3 backend sets: 69, 88, 89, 68 passing; verifier suite `roadmap-workflow.test.js` 72 of 72 (BE.04 and BE.05a add 12 to the earlier 60); web roadmap, canvas, transcript, render tests 198 of 198.
- BE.01a: `roadmap-lesson-entry.test.mjs` 7 of 7 and 3 added tests in `chat-modes.test.js`: a click and a typed lesson request reach one guarded create path; the same request from both entries yields one draft; a normal question, a single-card request and an ambiguous source keep their own paths.
- BE.05a: readiness and recovery at the first, manual and automatic offers and at acceptance; zero author dispatch, hold or debit for an unready or stale offer; the approved format and source revision reach the writer; the successor waits for the saved acknowledgment.
- Routing runner `chat-routing-fixtures.test.js`: 5 of 5. Report `routing-run-results.md`: 41 records, 30 pass, 11 miss, 0 wiring failures.

## Core Tutor fixes (7 Nov review, SEL.01-02, generation, delivery, Explanation caps, Contents and Chat recovery)

Implemented from the checklist section 2.1.3 repros with failing-first tests at the real entry points. Not seen in a browser. Open: a typed passage still plans the whole source (no offsets in the tool), the reconciler that moves an unknown charge outcome does not exist in src, the automatic offer does not catch a vanished source, and a source-caused failed card keeps the generic wording.

## TutorDiagram in written /explain (library commit f2423dfef)

New written-Explanation diagrams are authored, validated with `parseTutorDiagram` and drawn as `TutorDiagram` specs in an `rh-diagram` fence, in the body and in More sections; new Mermaid fences are refused; the legacy Mermaid reader stays for saved content. Not seen in a browser. Live author behavior (first-valid rate, repair) is unmeasured in the app; the Celeris lab run (20 prompts, one retry) gave 18 of 20 mechanical passes and 17 of 20 correct and clear within 2 s.

## TutorDiagram expansion, polish and the table frame (`1c9d012d6`, `e6d3a3063`)

`1c9d012d6` adds the 17-kind expansion (`4e9185b8`) and the renderer polish (`c766fe5a4`) to written /explain: authoring guidance for 17 kinds, visible-text caps (600 / 1000 / 1500 characters by Depth), one repair then an invalid diagram is dropped and the written explanation is delivered with the diagram area cleared, and the 19 library fixtures plus the benchmark flows p07 and p18 drawn in the real card at 688 and 320 px (46 screenshots). `e6d3a3063` draws a written /explain Markdown pipe table (body and More) in the TutorDiagram frame: shared surface, 12px rounded border, muted slate header, hairline row dividers, wrapping cells, sideways scroll only when the columns need more room; chat tables and every other Md table are unchanged; saved tables keep their Markdown and now draw in the frame.

Verified on `e6d3a3063` (tutor-r6 worktree `C:/s/tc-s7d2`, no browser on production):

| Run | Tests | Pass | Fail | Notes |
| --- | ---: | ---: | ---: | --- |
| `packages/web` `node --test "src/**/*.test.mjs"` | 5181 | 5153 | 1 | the failure is `explain-program/genuine-card.test.mjs` "time limit", a timing test that passed alone twice; 27 not counted as pass or fail by the runner |
| `packages/web` `vite build` | | | | exit 0 (an earlier exit 1 was a stray `)` in `Md.jsx`, fixed before the commit) |
| `explanation-card.test.mjs` + `explanation-diagram.test.mjs` | 16 | 16 | 0 | includes the new table-frame test |

Table frame look checked in a local harness (the real `LearningBlockBody`, stylesheet from an older build plus the new rules, theme by the `dark` class): saved-style table, a new table beside a TutorDiagram and a table in More at 688 and 320 px, light and dark. At 688 nothing scrolls; at 320 the wide tables scroll inside the frame. Not yet checked in the launched app with the app's theme switch, a real saved card, or that the canvas stays still while a narrow table scrolls.

The 20-prompt real /explain run (author model, Send to visible diagram, correct and clear, logic failures, text fallbacks) is **not done**: the `ANTHROPIC_API_KEY` in `small-deploy/.env` is rejected by Anthropic with 401 `invalid x-api-key` (also on `/v1/models`), so no model call was made and nothing was spent. The Celeris numbers above describe the lab model, not the real author, which is `claude-opus-5` through the plan transport.

## Not run, or unverified (stated, not passed)

- **No browser check of any kind.** Owner manual production acceptance is pending: Ask about selection (Capturing shimmer and Chat pill, Send held until the picture uploads, per-card evidence report), clickable Chat pills, Go to plan icon on skeletons, deleting a chat drops its waiting skeletons, ToC Card removed Restore, Depth control in Ctrl+K, back arrow to the top surface inside a rabbit hole, amber warnings, job_failed log line, Claude-orange tokens (Depth icon, spinners, waiting shimmer in Chat and cards), red Stop on every running card and its contrast, equal-height proposal buttons, Go to plan on the Explain skeleton, Explain on highlight (bulb opens Ctrl+K with the /interactive pill, skeleton beside the passage, Generate/Edit/Cancel order, red Stop), Depth icon, ToC composer and row menu, rename and Add a link, card headers, Chat invitation shimmer and action spacing, accepted ToC, the one canvas skeleton, bottom Next card, Explanation card scroll and Mermaid, minimap clearance under the page header, crash page behaviour.
- **23 end-to-end checks were edited statically and never run** (explain split, Depth locator, hidden Context button, proposal button order and height, tab order, Copy). Owner rule: no browser checks. Guesses called out by the editor: the `/interact` picker filter, the `[data-inline-prompt]` input read, and `source-ref-command-check` assuming Ctrl+K opens with no card selected.
- **Live model quality is unverified.** The 11 routing misses are paths the current JEV preflight cannot express (Whiteboard and Animation and CAD from free text, the recovery branch, a thread-switch seam); whether the real model chooses tools correctly under `CHAT_ANSWER_TOOLS` is unmeasured. `scripts/routing-live-eval.mjs` is ready and refuses to run without explicit spend approval; it has not been run.
- `CHAT_ANSWER_TOOLS` is **unset** in every config, so the JEV preflight path is unchanged in production until the owner sets it.
- Crash alerts: Sentry forwarding is inert until the `SENTRY_DSN` secret exists on the app Worker (it was uploaded 2026-11-07 and nothing reads it until this release ships); email goes to `CRASH_NOTIFY_TO` once the control plane deploys. Neither was exercised against real Resend or Sentry.
- Planner prompt `roadmap-plan-4` (adds `formatRequired`): behaviour against the live model is unmeasured.
- Source revalidation at offer acceptance is wired but not exercised end to end in tests.
- Deferred, listed in `OWNER-INBOX.md` and `core-gap-audit.md`: queued older invitations, server-stored conversation choice (needs a migration), changeable Scope after the first draft, image anchors, a separate reconciling stage.

## Release evidence

None yet. The release is run by the owner with the generated launcher; this section is filled from the production workflow run and the served build after it completes.
