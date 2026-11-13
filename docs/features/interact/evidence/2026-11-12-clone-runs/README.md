# /interactive real runs on the dev clone, 2026-11-12

Evidence for a review of branch `interact/capture-budget` (base `81028bb3f`, main at release 122). Everything here came from real runs on the dev clone
`rabbit-hole-web-dev-interact` (Cloudflare account of the repository, dev D1, test user `owner-interact-preview@example.com`). No production touch. No secret is in this
folder: the scripts read keys by name from an uncommitted `.env`. Job, board and canvas ids are dev-clone data.

Code head at the time of writing: `cc140cf87`. The commit that adds this folder follows it.

## Commits on the branch (oldest first, base `81028bb3f`)

| Commit | What it does |
|---|---|
| `435d802e2` | `capture_budget` design check (a timed plan may name at most 4 other distinct checkpoints) and the budget sentence in the author and reviser prompts |
| `3307d4cc0` | repair prompt: keep calling the approved `sdk.*` helpers |
| `56d04b5ff` | build and repair prompts: every readout and quantity at every state, finite |
| `914ad3b84` | design author prompt: scene size budget (60 objects, 3 markers, 6 entities, 4 readouts) |
| `38684361b` | DEV-ONLY `INTERACT_DESIGN_FIXTURE` pin (`interact-design-pin.js`): answers the three design roles from a fixture plan, gated on `SMALL_ENV` dev/test or `EXPLAIN_DIAGNOSTICS` |
| `8772e28f0` | a review rejection with only minor findings or none now gives the repairer a finding to act on |
| `4065a190e` | new fixture `toss-drop-standard-controls` (Standard as one Experiment: Launch speed 3.0 to 5.0 and a Show arrows select), registered as a pin fixture |
| `af0d2efbd` | the review layout text states the scrubber range at each input bound |
| `b56739001` | build and repair prompts ask for a 640 x 420 frame with text at the floors |
| `f6701d544`, `328488ddc`, `654c38a13`, `dea18eb24`, `64ed41c02`, `ec439bc80` | card restyle toward the written /explain card: font, connector and arrowhead, teaching surface and inset, text classes, drift test, chrome pin, and a byte-hash pin of the non-interact (/animation) Frame markup |
| `204126bc5`, `87ca0f49f` | fix-2 step 1: `sdk.vector` in the new opt-in SDK tuple `sdk-7`, capability `props` (sdk-2 bytes unchanged) |
| `cc140cf87` | composed cards take the written card's text sizes (17/14/14/13) and floors, interact mode only |

Not built: fix-2 steps 2 to 5 (`sdk.gate`, `sdk.groundMark`, the host overlap check, the prompt sentences, catalogue registration); restyle steps 3 and 4 (semantic `axis`,
`plot` and `diagram` frame kinds).

## Runs (cost = settled Opus calls of that job, from the job's `diagnostics.calls`)

| Folder | Design | Result | Stop reason and cause | Cost |
|---|---|---|---|---|
| `01-02-unpinned-design-runs` (`run1-failed` is run 1) | real | failed | run 1: `description_fit_unavailable` (`INTERACT_DESCRIPTION_FIT` unset on the clone and in prod config); run 2: `incomplete`, the plan had 7 checkpoints and the review reads 6 images | $0.95 and $1.26 |
| `03-unpinned-helper_missing` | real | failed | `rounds`: repairs dropped approved `sdk.*` helpers | $2.35 |
| `04-unpinned-readouts` | real | failed | `rounds`: readouts null, string or not emitted at some states | $1.81 |
| `05-unpinned-label-space` | real | failed | `rounds`: helper label space, 60-object cap, helper dropped again | $1.53 |
| `06-unpinned-capability_gap` | real | failed | `capability_gap`: the author chose a declarative main scene, which the card does not wire yet | $1.05 |
| `07-pinned-standard-no_progress` | pinned `toss-drop-standard` | failed | `no_progress`: a review rejected with no non-minor findings (fixed in `8772e28f0`) | $0.96 |
| `08b-pinned-standard-READY` | pinned `toss-drop-standard` | **ready** (repair round 3) | screenshots `c1` to `c6`: rest, mid-play, ended, Top marker, reload | $1.17 |
| `09b-pinned-controls-no_progress` | pinned `toss-drop-standard-controls` | failed | `no_progress`: the review saw only the default scrubber range (fixed in `af0d2efbd`) | $0.71 |
| `10-pinned-controls-READY` | pinned `toss-drop-standard-controls` | **ready** (repair round 2) | screenshots `e1` to `e7`: rest, mid-play, Top at 3.0, launch speed 5.0 at its top, arrows off, reload; the program declared 1120 x 590 | $0.86 |
| `11-pinned-controls-640x440-READY` | same | **ready** (repair round 2) | after `b56739001` the program declares 640 x 440; card 676 x 705 fits a 1440 x 900 viewport | $0.86 |
| `12-restyle-side-by-side` | n/a | n/a | `s3-side-by-side-100pct.png`: run 10 and run 11 interactive cards beside a written /explain card, deployed Version ID `a86e8c75-3e0a-4d18-b352-9579a081edd7` | written card cost not measured |

Total spend on the clone for runs 1 to 11: about $13.5. Failed unpinned design runs are the reason for the pin seam: the real design author never produced a
buildable plan in six attempts.

## Files in each run folder

`job-<id>-final-full.json` is the last `?detail=1` response (stages, calls with tokens and cost, findings verbatim per round). `plan.json` is the approved plan with its hash,
fit receipt and open checks. `poll.log` is one line per 10 s poll. `drive.log` is the Playwright driver log. `result-artifact.json` (runs 10 and 11) is the sealed program with its
source. Findings in `diagnostics.findings` are the deterministic problems and the rendered reviewer's findings of each repair round.

## Scripts

`scripts/`: `drive.mjs` (fresh canvas, Depth Balanced, send the row-110 prompt, click Generate, wait), `poll-job.mjs`, `deploy-clone.mjs` (build, deploy with the clone vars and
secrets by name), `driveB/C/E/W.mjs` (retry, screenshots, controls and the written card), `diag-size.mjs`, `shot-fit.mjs`, `prodvars.mjs` (read-only check of prod binding names),
`open-preview.mjs` and `.cmd` (the signed-in launcher, `--canvas <name>`). They need `RABBIT_HOLE_DEV_TEST_BYPASS` and the Cloudflare token in `small-deploy/.env` and run against the
dev clone only.
