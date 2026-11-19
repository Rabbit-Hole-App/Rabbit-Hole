# Release 167: BOX-1 and CRED-1 (2026-11-19)

The lead wrote this from its own runs. Release SHA **aee3dba82d9c4f87583611a063c65518c5500703** on `feat/release-167` (pushed, no force). Main is ab40f5dc9 (release 166), an ancestor, so the release fast-forwards. Recovery branch: **recovery/box-1-cred-167**, tip 3c4bc7af5019e01584dfe00d46da7d11aa3df2e8 (one commit with main's tree on top of the release SHA). Preview clone: rabbit-hole-web-dev-r167-int, "PREVIEW OK", record 53224a9279751dbf, build cfa84c5937d5. Launcher `C:\s\spec\release-queue\release-167-box-1.cmd` is built and its pins source cleanly; it is withheld until the Reviewer's GO. (An earlier preview of 590f42a6c, before CRED-1 was added, passed too; it is superseded.)

## What 167 contains
BOX-1, then CRED-1 on top (aee3dba82).

BOX-1: a box plot card gets its numbers from code. When the learner question lists one data list and the card has one box, the box values are set from the list; the median, quartiles, whiskers, fences and outliers are computed from them and written over what the author typed. A number named in a caption or the prose after Q1, Q3, median, IQR or a fence must match the drawn statistic (rule (c)); a filled outlier is labelled "Outlier". Commits on top of 166, oldest first: 2875788317, 42613ab72, b73c884aa, 8f732dc06, dc01298ec, e7d4bb3af, 422f9ffbf, then the merge 478c9815c and 05b84397a, 0b7a1e8b9, bc735e321, 22dc37551, 590f42a6c. No flag, no migration, no UI change.

CRED-1 (aee3dba82):
- `packages/web/src/tutor-diagrams/gen-1-argument-data.js` and `gen-1-t-account-data.js`: the helper `dollars` is now `fromCents`; in the first file `budgetDollars`, `reducedDollars`, `savedDollars` are now `budgetAmount`, `reducedAmount`, `savedAmount` (uses updated in `gen-1-argument-references.js` and `gen-1-argument.test.mjs`). The credits-only-ui scan flagged both data files, 13 lines in all (the lead's earlier note named only the first file; the second, gen-1-t-account-data.js, was also red).
- `scripts/mvp-fast-path.mjs`: new `TREE_SCANS` list. `credits-only-ui.test.js` lives in control-plane but scans web/src and control-plane/src; a web-only change never selected it, which is how it went red on main unseen. It now runs whenever a non-test file under either scanned tree changes, even when no control-plane file is in the change, and is not run twice. Test added in `scripts/mvp-fast-path.test.mjs`. The preview smoke list also names it.
- Output byte-identical: the 492 library request hashes match the 590f42a6c tree exactly (compared as files), and the 474-row replay is identical.

## Guards, 167 against 166 (ab40f5dc9)
- Request hashes: 53 moved, body and fireworks only (schema 0, gemini 0, max Gemini properties 350, limit 362). They are the 51 library box-plot requests plus 2 pool references that 166 holds, all BOX-1's. Nothing else moved (list: C:/s/box1-bench/moved167.txt).
- 474-row replay: identical. svg-snapshots.json: identical.
- Tests: tutor-diagrams directory 1619 of 1619; credits-only-ui 3 of 3 (was red on 166); box values and credits test files 21 of 21; fast-path script tests 25 of 25; preview's focused control-plane/web set 85 of 85 plus the render e2e check, all green.
- **Not measured: bundle size and startup.** My wrangler dry-run command was refused by the permission layer, so I did not run it by another route. For reference, 166 was 9157.86 KiB (gzip 2320.11). CRED-1 renames identifiers only; BOX-1 added the box-value code measured earlier. Startup was not re-measured (the machine has several lanes running).

## Replay list for the five rule (c) additions
Replayed: every delivered AFTER card of the three BOX-1 measurements through the old rules (e7d4bb3af) and the new rules (590f42a6c): v1 5 cards, v2 15, v3 15 (35 in all). Script `C:/s/box1-bench/replay-v4.mjs`.
- Rejected by old and new: v2/13 ("IQR 14.5", "upper fence 122.75" against drawn IQR 19.5, fence 136.25) and v2/15 ("IQR 14", "upper fence 120"). Both are wrong cards.
- Newly rejected: **v3/9**, "the text states 'box from 17 to 24'" against a drawn box Q1 16 to Q3 24.5: rejected by the "box from A to B" addition. **v3/15**, "IQR 14", "upper fence 125" against drawn IQR 19.5 and fence 136.25: rejected by the equation-result addition ("104 - 90 = 14" and "104 + 1.5 x 14 = 125": the results after the equals sign are what the card claims).
- The unit, copula (is/equals) and number-word additions rejected none of the 35 delivered cards; on the saved-card replay, 208 saved cards go from 6 flagged to 7 (the one added is a saved-card artefact, not a model card; which addition flags it is not recorded here).
- No correct card of the 35 is rejected by any addition. Library, pool and gallery: 0 flagged.

## Other items found
- Five `rabbit-hole-prod-config` failures are not /explain's and not fixed here: see the lead's note to the Reviewer (test names and first failing commit f0ae33c53, 2026-11-17 09:35 PT).
- R3 (a7c8b7f9b) is on hold per the Reviewer; nothing here depends on it.

## Owner steps after the Reviewer's GO
The owner runs `release-167-box-1.cmd` (one launcher). After release, delete my preview clone `rabbit-hole-web-dev-r167-int` when the next preview exists (cf-clones.mjs).
