# Merge of rehearsal/sections into main: pre-merge checks

Prepared on 2026-11-16 (PT) for the owner and the Reviewer. **Nothing has been pushed to main**, and no production database was touched.
The Reviewer reads this first; the owner gives the push and the `!` commands.

## 1. The local merge

- Local `main` was reset to `rabbit-hole/main` 74c4f68ae.
  - The previous local main, with merges 022bc04d2, 788ed2594 and 73600eabb, is kept as the branch `backup/main-before-sections-merge`. Every non-merge commit it had is in `rehearsal/sections`.
- One `--no-ff` merge commit of the final `rehearsal/sections` tip is on local `main` in the worktree `C:/s/main-merge`. Its SHA is given with this report; a merge commit cannot name itself in its own tree.
- `git diff main rehearsal/sections` is empty: `rabbit-hole/main` is an ancestor of `rehearsal/sections`, so the merge tree is the sections tree.

## 2. Tests that fail on current main (pre-existing)

All of these were run on `rabbit-hole/main` 74c4f68ae, in a clean worktree (`C:/s/main-check`).

**The three explain-suite tests (control plane)** fail on main too:
- `explain-heat-grid.test.js:62`: the SDK fingerprint differs.
- `explain-program-budget.test.js:69`: fixed request 44007 bytes, against a limit of 44000.
- `explanation-gemini-illustration-bundles.test.js:49`: property count and length for "how does the water cycle work?".

**The two animation runtime tests** do not fail on main and do not fail on the merge when run alone:
- `interact-checks.test.js`: 28/28 pass on both.
- `interact-e2e.test.js`: 37/37 pass on both. This file holds "Standard toss-and-drop: the runtime traces…" and "prompt -> design -> Review scene plan -> …".

They failed only in a run where the web and control-plane suites ran at the same time on one machine. That points to load or timeouts, not code.

**The web unit suite on main fails 11 tests**, all also failing on the merge:
- explain-program SDK fingerprints: `cyclic-runtime`, `medium-runtime`, `raster-runtime`, `sdk-figures`, and `stamps` ×3;
- `motion-ownership` mutation proof;
- `render-freshness`;
- tutor-diagrams `figure-layout` and `svg-snapshots`.

None of these was fixed here: they are main's.

## 3. Full suites on the merge commit

| Suite | Tests | Pass | Fail | Notes |
|---|---|---|---|---|
| Web unit (`packages/web`, `npm run test:unit`) | 7184 | 7144 | 12 | 11 are main's own (section 2). The 12th was ours: `inline-ai-annotation.test.mjs`, where the board-links reader scan matched the prose "links," in `learn-section-make/browser.js`. It is fixed in a4f51d707 and passes (4/4). |
| Control plane (`packages/control-plane`, `npm test`), run alone | 4776 | 4770 | 5 | 3 are main's explain tests. M3 (`explain-m3.test.js`) is a load flake: 25/25 alone. `no-ellipsis.test.js` was ours: a `'...'` gap line in `learn-section-record.js`. It is fixed in a4f51d707 and passes. |
| Main for comparison, control plane | 4632 | 4628 | 3 | the three explain tests |
| Main for comparison, web unit | 7064 | 7025 | 11 | as listed in section 2 |

- The run of both suites at the same time showed 10 control-plane failures. Five of them do not reproduce when the suite runs alone: the two interact tests, the review-correction call, the attention matrix values, and the reference-row script. They are load flakes.
- After the two fixes, the final merge differs from the tested merge only by those two fixes and this file. Section 8 lists the tests re-run on the final merge.

## 4. Production bundle

Built with `scripts/prod-release.mjs`'s own `BUILD_ENV`: the dev-only variables stripped, with no `VITE_REHEARSAL_TRIGGER`. The build used no `VITE_TLDRAW_LICENSE_KEY`; its value lives in the `.env` file, which I do not read. That key only affects tldraw's licence notice. Both `dist` and `dist-dev` were built.

- **No dev chip, no dev rows.** None of these strings appears in any shipped chunk: `TutorRehearsal`, `Make section`, `learn_section_make`, `learn_section_brief`, `RECORDED RUN`, `Loading the run card`, `/api/learn/run`. No `RunCard`, `TutorRehearsal` or `CodeExplainCard` chunk exists.
  - "Next section - skips this section" does ship. It is main's own contents string (`ask.jsx sectionNote`, present on main), not a dev row.
- **`e2e/production-bundle-check.mjs`: FAIL.** The check, in the version on this branch, lists `code-explain` as a dev-only marker. The string is shipped in `app-*.js` and `inline-ai-route-*.js` through two places, both from the rehearsal runtime work, not the sections work:
  - `inline-ai-route.js:192 CODE_CAPABILITIES`, the router's capability table, which the server and the client share;
  - `generation-proposal-chat.js:223`.

  Neither is on main, and main's check does not have the marker, so a release from main passes today and a release from this merge would not. **Decision needed (not changed here):**
  - (a) Narrow the marker to the card's DOM marker (`data-code-explain-card`, still checked) and the chunk names. The capability name is a shared route constant, not dev UI.
  - (b) Keep the marker, and keep the `code-explain` capability out of the client build behind `REHEARSAL`. This touches a module the server imports.

  Recommendation: (a). The card itself already stays out of the build, through `DEV_CHUNKS`.
- **Production workers build.** `wrangler deploy --dry-run --config wrangler.rabbit-hole-prod.jsonc` passed for both workers:
  - `rabbit-hole-app`: 10049.50 KiB, gzip 2544.75 KiB. The bundle's export block has all ten bound Durable Object classes: `AnimationJobs`, `CadJobs`, `ExplainJobs`, `FileJobs`, `ImageJobs`, `LearnScenes`, `LearnVideos`, `RepositoryImports`, `RoadmapJobs` and `WhiteboardJobs`. It also exports `RepositoryRehearsals`, which production does not bind, so the rehearsal does not run in production.
  - `rabbit-hole-cp`: 5108.03 KiB, gzip 1215.49 KiB.
  - Neither bundle contains pdf.js.

## 5. Migrations (Learn D1, `rabbit-hole-learn-prod`)

The release preflight requires the production Learn schema to equal `repository-schema.sql` plus every learn migration (`docs/features/prod-release.md`). This merge adds two tables to `repository-schema.sql`, so **0045 and 0046 must be applied before the release preflight will pass.** That needs the owner's GO; migrations are never applied by the release job.

| Order | Migration | What it adds | Notes |
|---|---|---|---|
| (Document card) | none | | The Document card is a canvas block (canvas JSON). This merge adds no table or migration for it; the only schema changes in the diff are the two below. |
| 1 | `learn-migrations/0045-compute-usage.sql` | `compute_entries` and index `compute_entries_user_period` | Compute usage metering |
| 2 | `learn-migrations/0046-learn-sections.sql` | `learn_sections` | Learn sections. `purgeTutorRows` deletes its rows only where the table exists. |

Commands, from the repository root, run by the owner in order:

```
cd packages/control-plane && npx wrangler d1 time-travel info rabbit-hole-learn-prod --config wrangler.rabbit-hole-prod.jsonc
cd packages/control-plane && npx wrangler d1 execute rabbit-hole-learn-prod --remote --config wrangler.rabbit-hole-prod.jsonc --file learn-migrations/0045-compute-usage.sql -y
cd packages/control-plane && npx wrangler d1 execute rabbit-hole-learn-prod --remote --config wrangler.rabbit-hole-prod.jsonc --file learn-migrations/0046-learn-sections.sql -y
```

Record the bookmark the first command prints; it is the data restore point. Production was last read as identical through 0035 (5 November); 0036 to 0044 are assumed applied because releases from main since then passed the identity preflight. The release preflight confirms this.

## 6. Rollback

- **`rollback/pre-rehearsal-merge` is stale.** On `rabbit-hole` it points at 18cf9fce8, which is **25 commits behind** current main (74c4f68ae). Rolling main back to it would also drop those 25 commits. Before the push, move it to current main:

  ```
  git push rabbit-hole 74c4f68aeba1384336418c5230528138ef8ec113:refs/heads/rollback/pre-rehearsal-merge --force
  ```

  This is a forced update of that one branch only; it is the owner's command.
- **Code:** reset main to `rollback/pre-rehearsal-merge`, or revert the merge commit with `git revert -m 1 <merge sha>`. Then release as usual.
- **Workers:** run `npx wrangler rollback <version from the receipt's previous pair> --config wrangler.rabbit-hole-prod.jsonc` from each Worker's package, the app first, then the control plane (`prod-release.md`).
- **D1:** roll back each migration in reverse order. The data in that table is lost.

  ```
  cd packages/control-plane && npx wrangler d1 execute rabbit-hole-learn-prod --remote --config wrangler.rabbit-hole-prod.jsonc --command "DROP TABLE IF EXISTS learn_sections" -y
  cd packages/control-plane && npx wrangler d1 execute rabbit-hole-learn-prod --remote --config wrangler.rabbit-hole-prod.jsonc --command "DROP INDEX IF EXISTS compute_entries_user_period; DROP TABLE IF EXISTS compute_entries" -y
  ```

  Or restore the whole database to the bookmark recorded before 0045 (destructive, an owner GO every time):

  ```
  cd packages/control-plane && npx wrangler d1 time-travel restore rabbit-hole-learn-prod --bookmark <bookmark> --config wrangler.rabbit-hole-prod.jsonc
  ```

  After a code rollback, the two tables must be dropped too. Otherwise the identity preflight refuses the next release from the old code.

## 7. Production flags (nothing new shows by default)

| Flag | Where | Value now | Needed | Effect |
|---|---|---|---|---|
| `VITE_REHEARSAL_TRIGGER` | the build environment (`prod-release.mjs BUILD_ENV`) | not set | not set (off) | No Tutor rehearsal flow, Run card, code-explain card or section dev rows are built in. Checked in section 4. |
| `AI_MONTHLY_ALLOWANCE_USD` | `packages/web/wrangler.rabbit-hole-prod.jsonc:181` | `"25"` | 25 | Already set. |
| `COMPUTE_RATE_CPU_CORE_SEC_MICROS`, `COMPUTE_RATE_MEM_GIB_SEC_MICROS`, `COMPUTE_MONTHLY_ALLOWANCE_USD` | not in either prod config | absent | present (see Decision) | `learn-compute.js` falls back to the code defaults 39.42 and 6.67 micro-USD per core-second and GiB-second, and US$10 a month, never to unlimited. |
| `REHEARSAL_WORKER_URL`, `REHEARSAL_WORKER_TOKEN` | prod secrets | not set | not set | The rehearsal controller stays unconfigured in production, and `RepositoryRehearsals` is not bound. |

**Decision:** the compute rates are "present" only as code defaults. To pin them in the production config, add the three `COMPUTE_*` variables to `packages/web/wrangler.rabbit-hole-prod.jsonc` before the release; this was not done here.

## 8. Final tip and checks on it

- The final `rehearsal/sections` tip is the commit that adds this file. Under it is a4f51d707, the two fixes from section 3; this commit adds only documentation.
- On the final merge commit, these were re-run alone:
  - `packages/web`: `src/inline-ai-annotation.test.mjs`;
  - `packages/control-plane`: `test/no-ellipsis.test.js`, `test/learn-section-*.test.js`, `test/explain-m3.test.js`.

  The results are given with this report.
- 8878 (`owner/local`) is rebuilt with the same tip for the owner's click-through, which is the gate (Reviewer 10:50).
