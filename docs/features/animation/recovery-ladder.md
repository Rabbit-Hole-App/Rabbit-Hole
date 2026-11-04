# Recovery ladder for the SGD release

**Reference. Parallel sends commands at the moment of use.** The commands below are written down so they are verified in advance. None of them is a standing instruction, none is run by this document, and none touches production by itself.

Owner decision 23 (3 November 2026): **one** fast-path release carries MVP2b, MVP3, MVP4 and MVP5 together, after the `--mvp` branch release and both gates have passed. So there is one recovery branch for the release, `combined`, and four smaller ones (`mvp2b`, `mvp3`, `mvp4`, `mvp5`) for a case where only one part is at fault. All five are cut by the same script from the same candidate.

## The rule

- Recovery is always a **forward** release. Cloudflare cannot roll a Worker back across the `animation-jobs-1` migration, and a binding, a migration tag or a stored result is never removed.
- A recovery branch is cut **from the release candidate** (C4, the one final tree; earlier drafts called it C5) and carries one commit on top. It is pushed to `rabbit-hole` **before** the preview, because the MVP launcher requires it: `preview --mvp ... --recovery <branch>` refuses a branch that is not on `rabbit-hole`, is the release commit itself, or does not contain the release commit; `prepare --mvp`, `mvp-fast-path verify` and `release-mvp.sh` check the same again.
- If C4 changes, every recovery branch is cut again from the new sha. A branch is bound to its candidate.
- The recovery is released the same way as the release (fast path, owner's `MVP_ALLOWED_SHA` for that exact sha, `release-mvp`), or by the ordinary gate if the owner prefers. Nothing here bypasses a command guard.

## What each switch flips, and the evidence

Evidence below is from the lane branches read on 3 November and from running the script against them (see "Evidence runs").

| Part | Smallest safe switch | Effect | Why this one |
|---|---|---|---|
| MVP2b streaming | `"ANIMATION_STREAMING": "false"` added to the vars of `packages/web/wrangler.rabbit-hole-prod.jsonc`, and the third Animation var listed in `rabbit-hole-prod-config.test.js` | `animationStreaming()` (`animation-policy.js`) returns null: the author and repair calls are one non-streaming request with no deadline, exactly as before. The billing escrow, the same-job retry and the repair settings are untouched. | The flag is the lever the transport lane built (`animation-transport.test.js` pins `ANIMATION_STREAMING=false`); the release does not set it, so the default is on. A Worker var, so it is a forward config release like `rollback/animation-disable`. |
| MVP3 five client features | In `packages/control-plane/src/animation-brief.js`, `clientFeatures()` drops `surface_grid`, `trail_points`, `text_readout`, `arrow_anchor` and `clamp` from any declared list. The test files the candidate added for those features are removed, and so is the one assertion in `animation-old-client.test.js` that pins the capability text for a browser that declares `surface_grid` (found by the combined dry run: with the filter the author is no longer told it may draw a surface, which is the point). | Every job counts as not declaring them: `clientProblems()` refuses a new draft that uses one (repairable), and `readResult` answers `409 client_update_required` for a stored scene that needs one (the text says reload, which does not help: the cost of a switch-off without a new message). The browser still declares all seven; the contract and renderer stay. | **Not** `capabilities.js`. `scripts/prod-release.mjs` `checkCandidate` refuses a release whose tree no longer declares a client feature the served release declares. The script asks the real `checkCandidate` before it finishes: removing the five from `ANIMATION_CLIENT_FEATURES` gives `refused: production serves ..., whose Animation client declares surface_grid, trail_points, text_readout, arrow_anchor, clamp, and ... does not`; the `clientFeatures()` filter gives `checkCandidate accepts`. The same conclusion is in `old-client-compatibility.md`. |
| MVP4 prompts | `agents/animation-author.js`, `agents/animation-brief.js` and the control-plane tests that pin their text go back to the text of `--prompts-from` (the prompt base `P` for the combined branch, derived by `prompts-base.mjs`; the previous release otherwise). | The planner, author, repair and review prompts are the earlier text. The plan `archetype` and `assertions` fields stay in the contract and are simply not asked for. | Prompts are data in two files; nothing else changes. If a file that is not restored imports something a restored file no longer exports, the cut fails when it is cut (its tests), and that file is added to the recipe. |
| MVP5 copy and claim | The request-box line ("Loss surfaces and optimizers are not supported yet"), its unit test and its e2e step go back to the previous release; SGD leaves the claimed list. | Learners are told again. Docs are not touched. | The step is `required`: if no changed file carries the old line in the previous release, the cut stops (wrong `--prev`, or the copy moved). The copy is in `packages/web/src/agent/slash.js` today; the recipe finds it by content, not by name. |
| **combined** | all four, in one commit, composed from the four recipes | one branch, one release | Owner decision 23. |

## When to use which

| Symptom after the release | Cut |
|---|---|
| author calls time out or fail in the transport, or streamed answers misbehave | `mvp2b` |
| stored or new SGD scenes draw wrongly, a primitive misbehaves, an old browser is shown a broken scene | `mvp3` |
| prompt regression: the three known-good plans (grid game, pendulum, projectile) author worse, or SGD drafts stop validating | `mvp4` |
| the request box or the claimed list is wrong | `mvp5` |
| unsure, or more than one of the above | `combined` |

Use the smallest that explains the symptom. Billing, the refund of a rejected job and the Durable Object never change in any recovery.

## Steps (the script does 1 to 5; Parallel sends the commands when it is time)

1. Read-only: confirm the candidate sha, the previous release, and for `combined` the prompt base: `node scripts/animation/prompts-base.mjs <C4>` (read only; two independent derivations over the first-parent history, it exits 0 only when they agree).
2. `bash scripts/animation/cut-recovery.sh <slice> <C4 sha> [--prev <sha>] [--prompts-from <P>] --push`. Local only without `--push`; a plain push, never forced; a remote branch of that name that is not an ancestor is refused.
3. It proves, and prints, that: the candidate is an ancestor and the tip a strict descendant; the diff against the candidate is exactly the files the recipe touched and inside the slice's allow list; the recipe's own test sets pass on the branch; and the tree's own `checkCandidate` accepts the tip as a release over the served candidate. Any failure deletes the new branch and returns you to where you were.
4. Name the branch in the preview: `node scripts/mvp-fast-path.mjs preview --mvp --sha <C4> --recovery <branch> --smoke "..."`.
5. If it is ever needed: release the branch tip with the same launcher, for its own sha, with the owner's `MVP_ALLOWED_SHA` set to that sha.
6. Verify, read-only, through `with-cf.mjs`: `node scripts/animation/post-release-verify-ladder.mjs --slice <slice> --sha <recovery tip> --recovered`. It expects the recovered state: streaming "false", the five features still declared by the browser (the filter is server side), and the "not supported yet" line back.
7. Record the incident in `fix.md` with the recovery tip and the reason; the original candidate branch is kept.

## What the owner's release script requires

`release-mvp.sh` reads the record written by `preview --mvp ... --recovery <branch>` and refuses unless the recorded recovery branch is still on `rabbit-hole` with a tip that is a strict descendant of the release sha. `--check` reads only. The owner sets `MVP_ALLOWED_SHA` for the exact sha and removes it afterwards; agents never set it.

## Evidence runs (3 November 2026)

Each ran `cut-recovery.sh` against the real lane code in a scratch worktree, nothing pushed:

| Slice | Candidate | Result |
|---|---|---|
| mvp2b | `feat/an17b-transport` `a7a2c6a9c`, prev `caf7ee9bc` | 2 files (`wrangler.rabbit-hole-prod.jsonc`, `rabbit-hole-prod-config.test.js`), 62 tests, `checkCandidate` accepts |
| mvp3 | `feat/golden-sgd` `1539ae4ce`, prev `caf7ee9bc` | 3 files (`animation-brief.js`, the two test files the candidate added), 84 tests, `checkCandidate` accepts; the `capabilities.js` variant is refused |
| mvp4 | `feat/an20-prompts` `452bb75a1`, prev `caf7ee9bc` | 3 files (the author prompt, `animation-fit.test.js`, `animation-sgd-mvp1.test.js`), 74 tests, `checkCandidate` accepts |
| mvp5 | a simulated copy change on top of `feat/an17b-transport` | 3 files (`agent/slash.js`, `agent/slash.test.mjs`, `animation-mvp-check.mjs`), 80 tests, `checkCandidate` accepts |

The `combined` recipe is those four composed. Its offline test (`scripts/animation/cut-recovery.test.sh`) cuts it on a throwaway repository with the real recipe file and the real `checkCandidate`. Cut it against the real C5 as soon as C5 exists; the cut fails loudly if any recipe step no longer matches.

## What this does not cover

- A recovery does not rewrite a stored artifact or a job; reads never write.
- The recovery branch is not rehearsed in a browser. The owner or CI does browser checks.
- The 409 text for a recovered MVP3 says to reload, which does not help; a new message would be a separate change.
