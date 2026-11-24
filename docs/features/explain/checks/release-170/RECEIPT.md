# Release 170: receipt (2026-11-24)

Written by the lead session at 2026-11-24 13:26 PT, read-only: it fetched main and the notes ref, read the two launcher logs and the GitHub Actions log of the release run, and ran no release step, no deploy and no production read of its own. The owner ran the launcher; the lead did not. The facts below are what those logs and the remote say.

## Main after the release

- Main on the remote: **b29b6bdd7f17c8b700aca15875f99fe7b6a377ae** (`git ls-remote rabbit-hole refs/heads/main`, fetched after the owner's message).
- Parent **0e6a1475b2737ff80edf47484d4ad33ed8baf4f4** (release 169's commit), grandparent **d0addb74afb03cbc3cf82b01a5afc812e2bf5e6e** (release 168). `git rev-list d0addb74a..main` gives 2 commits and 0 merge commits: a fast-forward, as expected.
- The launcher reported: `main d0addb74..b29b6bdd pushed (01:19 PM PT)`.

## The release run

- Run id **45489959204**, workflow "release", conclusion **success** (`release run 45489959204: success (01:21 PM PT)`). Run log read with `gh run view 45489959204 --log` (a GitHub read; saved locally as C:/s/same-json-run/run-45489959204.log, not committed).
- Launcher logs read: `C:\s\spec\logs\release-all-170-rel-crossings-check-20261124-131908.log` (the check, 01:19 PM PT, "CHECK COMPLETE: nothing was pushed") and `C:\s\spec\logs\release-all-170-rel-crossings-20261124-131914.log` (the release, finished 01:23 PM PT).

### What the launcher printed (verbatim, the release log, from the check line on; the long label line is cut to its start and end)

```
=== MVP release 170-rel-crossings: Release 170: content only (reference data, its svg snapshots and token budgets). Removes the arrow crossings ... No flag, no migration, no code change.; candidate b29b6bdd, main must be d0addb74 (01:19 PM PT) RUN ===
✓ MVP record ffe9faca08740ff5 for b29b6bdd: build pass, affected-tests pass, smoke pass, preview pass; rabbit-hole-web-dev-r170-int; recovery recovery/rel-crossings-170; broad CI and the release gate bypassed
checks ok: worktree at b29b6bdd, main d0addb74 fast-forwards to it, dev 4102f8ea is an ancestor, MVP record ffe9faca08740ff5 verified, recovery branch recovery/rel-crossings-170 on rabbit-hole contains it, vars.MVP_ALLOWED_SHA allows it. No gate, verify or fast-e2e was asked for.
published the MVP record as the dev-deploys note of b29b6bdd
main d0addb74..b29b6bdd pushed (01:19 PM PT)
release run 45489959204: success (01:21 PM PT)
WARNING: the MVP banner is not in the release log of run 45489959204: read it before trusting this release
release	Release	2026-11-24T21:21:41.8420387Z ✓ released b29b6bdd7f17c8b700aca15875f99fe7b6a377ae build fedd71e734844312: rabbit-hole-cp 75c5bc6d-f133-44c9-a138-4cd94ce553e6, rabbit-hole-app 998cf693-1c55-4d73-a88a-121f1b98fe8f; smoke passed
200 200 
================ MVP MODE: broad CI and release gate BYPASSED by owner policy ================
RELEASE DONE (170-rel-crossings): b29b6bdd is on main (01:23 PM PT). Now remove the allowance: gh variable delete MVP_ALLOWED_SHA -R Rabbit-Hole-App/Rabbit-Hole
```

(The GitHub "found 130 vulnerabilities" remote messages around the two pushes are omitted.)

### About the WARNING line

The launcher warned that the MVP banner was not in the release log. **The banner is in the run log**: `MVP MODE: broad CI and release gate BYPASSED by owner policy` appears in the steps "MVP preview record of this commit" (21:20:35), "Prepare (build, no deploy credential)" (21:20:51) and "Release" (21:21:08, with `(MVP preview record ffe9faca08740ff5)`). The run log has no `MVP record IGNORED` line. The step printed `env: MVP_ALLOWED_SHA: b29b6bdd7f17c8b700aca15875f99fe7b6a377ae`, so the allowance matched at run time and the record was used. The same WARNING line is in the logs of release 167 (run 44642315716) and release 168 (run 44937330719), so it is how the script behaves, not new; why its own grep misses the banner was not investigated.

## What the verify step reports, and what it compared it to

- **Build / version:** production build **fedd71e734844312**, Workers versions rabbit-hole-cp 75c5bc6d-f133-44c9-a138-4cd94ce553e6 and rabbit-hole-app 998cf693-1c55-4d73-a88a-121f1b98fe8f. The release receipt in the run log records `outcome: released`, `run: 45489959204.1`, at 2026-11-24T21:21:22.724Z (01:21 PM PT).
- **Compared to:** the receipt's `previous` block, which is release 168's pair: rabbit-hole-cp 661709f3-d170-4dec-a1f9-300c244f398e, rabbit-hole-app 368ece04-a1fe-458e-9443-7c65377fe154, release `d0addb74afb0` (the receipt also records the two database bookmarks taken before the release). The run's smoke compared production against fixed expectations, all `ok: true`: `GET / 200 and the new build's entry` got `200 /static/landing-c7-liyPh.js`; `GET /static/landing-c7-liyPh.js 200` got 200; `GET /login 302 to /sign-in` got `302 https://digrabbithole.com/sign-in`; `GET /a/x 404` got 404; `GET /api/me 401` got 401. Then the launcher's own two checks, `/` and `/sign-in`, printed `200 200`.
- **The record the release used** (note, digest ffe9faca08740ff5): preview build `caa7e9fb6eed` on rabbit-hole-web-dev-r170-int, checks build, affected-tests, smoke and preview all pass, recovery branch recovery/rel-crossings-170 at 4863d875ce634ecce4726dadf914d7837b301f46. The production build id (fedd71e734844312) is a different build id from the preview's (release 168 showed the same pattern: preview caa7e9fb6eed, production 71f6be9afed76778).
- The release step's build printed an esbuild warning `Duplicate key "formatName" in object literal` in `src/roadmap-strings.js` (lines 70 and 8). The file is not in this release's diff (six files, all under packages/web/src/tutor-diagrams/); it is a warning, not an error.

## refs/notes/dev-deploys

Done by the launcher, not by hand: its log says `published the MVP record as the dev-deploys note of b29b6bdd`. I fetched `refs/notes/dev-deploys` afterwards (remote tip 0e20bb5530765e7e0195e7ce57096d9f36daa94f): it holds a note on b29b6bdd7 with `"mvp":true`, `"digest":"ffe9faca08740ff5"`, `"base":"d0addb74afb03cbc3cf82b01a5afc812e2bf5e6e"`, `"build":"caa7e9fb6eed"` and the recovery branch and tip above.

## Allowance and branches

- `vars.MVP_ALLOWED_SHA`: `gh variable list -R Rabbit-Hole-App/Rabbit-Hole` no longer lists it (the launcher's last step deletes it; I did not see the console line `release 170 OK`).
- Nothing deleted yet: feat/release-169 0e6a1475b, recovery/rel-content-169 7f9bff651, feat/release-170 b29b6bdd7 and recovery/rel-crossings-170 4863d875c are all still on the remote.
- Release 169's launcher was not run (no `release-all-169-*` log exists); its commit is in production as the parent of this release.

## Not checked

- **No one looked at an Explain card in production.** Not this session (standing rule: no Claude browser and no production read by an agent), and the owner has not said they did. So the two changes of this release (the U-Net card and the shared key/value card with the original edge order; wider at a 408 request, 564 px and 540 px) are not seen live. The only production signals are the launcher's smoke and the two `200` answers above.
- Nothing about production beyond what the launcher and the run log printed: no production data, no counts, no bundle size, no startup time, no error rate after the release.
- The cause of the launcher's banner WARNING (see above).
- Whether the cards served from production show the new snapshot widths (only the preview smoke and the render check saw them, before the release).
- Cloudflare-side state (versions are quoted from the run log, not read from Cloudflare).
- Release 167/168 receipts were not rewritten; nothing before this release was re-verified.
