# Learn sections: morning report (overnight 2026-11-16)

Read BLOCKERS.md first. All of it is behind `VITE_REHEARSAL_TRIGGER`. Nothing was pushed to `main`, and nothing touched prod D1.

## SHA range and where it runs
- Branch `rehearsal/sections`, from `rehearsal/mvp` d6e42614d (00:46 PT) to the tip that carries this file. Lane branches: `rehearsal/sections-core`, `-browser`, `-tools`, `-evidence`, all on `rabbit-hole`.
- 8878 runs `owner/local` with `rehearsal/sections` merged in: rebuilt, restarted, `/library` returns 200.
- The `learn_sections` table is created locally from `repository-schema.sql` when the stack starts; migration `0046-learn-sections.sql` is not applied to prod.
- Hard refresh (Ctrl+Shift+R) before trying it.

## What is built, per spec section
| Spec | Built | Commits |
|---|---|---|
| A §1, §4, §5, §8 brief | `learn_section_brief` action, `validateBrief` (+E), research wrapper, `learn_sections` table, `checkpoint.learn` section progress, overlay byte-for-byte | 986921332, 46e657aa4 |
| A §8 Browser | brief and compose on Accept for 1.1, dev rows **Next section** and **Make section**, beats and items under a dev disclosure, failure rows | a3dac76e7 |
| B §2-§8 compose | `learn_section_compose`, `validateComposition` (+D, F), `SECTION_TOOLS` with `directTools(…, { sectionFlow: true })`, overlay byte-for-byte | 734298403 |
| C §0, §11 Make | dispatcher: `learn_section_make` / `made` / `next`, `submit_item`, lead/follow caps, notes item (G), one re-ask then skip with a note | 24340a2f6 |
| C §1 written /explain (M, N) | `explanation.js`; anchors in `context` as text (cap 8000 characters, the artifact route's limit) | e5b98e889, e99b35bb7 |
| C §2 code (O, P) | repository cards with `ranges`, example code at 100 lines / 4000 characters for section items | b81483068, 1bd3aad79 |
| C §3 notebook (Q) | validator and nbformat files, Pyodide list as data, runtime marks, `insertNotebook(block)` | c39b75b92, f157de3d9, 48777ba43 |
| C §4 document (J) | `document.js`, lead/follow as Document cards with `block.learn`, KaTeX block and inline math | e5b98e889, e099a681f, 170a9ec5d |
| C §5 YouTube | validator: window from the passages read, 5 min bound lifted for section items | 2f51e66dc, a5993998a |
| C §6 arXiv (S, U) | validator with the page-text quote check, quotes painted on open, `papers[]` by rule | 17dae10c2, a5993998a, a1a036d42 |
| C §7 Wikipedia | validator, quote on the card, `not_found` reported on open | bd3b5c0c8, a5993998a |
| C §8 diagram, §9 graph | validators (nodes from anchors or taught ideas; graph parameters from anchors, illustrative corrected) | 573a37e4a, db6e1c800 |
| C §10 browser (T, K) | validator, `insertWebpage` then quotes anchored and highlighted on capture | f38869d5a, f241ae82a |
| Fixes from the runs | errors in failure logs; research capped at 2 steps; section cost estimate (see BLOCKERS.md) | 50b57a55e, b1767c695, 7021eb980, 70aebff4d, cc33b4923 |

## Runs (API-level, owner stack 8878, signed in as a mock test user)
Every file below is under `docs/features/learn-sections/`.

| Run | Result | Files |
|---|---|---|
| Plans | nanoGPT "Preparing text into token files" (data option, 23 ops), datasette "Core app, views and plugins" (structure, 23 ops). A first nanoGPT plan on the science option was not used. | `prepare/` |
| Briefs | nanoGPT 1.1, 1.2, 1.3, 2.1: ok. datasette 1.1: ok. **datasette 1.2: FAIL**, refused after the re-ask: code names in beat ideas (errors in BLOCKERS.md). | `brief/` |
| Compositions | nanoGPT 1.1, 1.3, 2.1, datasette 1.1: ok. **nanoGPT 1.2: FAIL**, "beat b3 has no item" after the re-ask. datasette 1.2: not run (no brief). | `compose/` |
| Make, pre-review overlay | nanoGPT 1.1, 1.3, 2.1, datasette 1.1: 21 Make turns. Explanation, code (repository and example), notebook and notes were made; skips are listed below. | `make/` |
| Perform check | 2 slash performs sent to `/api/learn/artifact` as the browser would: an explanation card (HTTP 200) and a 24-line code snippet (HTTP 200) | `make/*-artifact.json` |

Make skips, each after one re-ask:
- Quiz ×3: Make has no quiz module; compose may choose quiz because it is in the ordinary tool set.
- Explanation ×2: a code name in the prompt, and the number 65, which is not in the source.
- Diagram ×1: node "App (hub)" maps to no anchor or taught idea.

## Costs (actual, from the stack log)
| Stage | Calls | US$ |
|---|---|---|
| Plans (3 runs) | 6 | about 0.42, worst-case estimate (the plan log carries no actual cost) |
| Briefs (10 runs, including 4 datasette 1.2 retries) | 26 | 0.352 |
| Compositions (5 runs) | 10 | 0.134 |
| Make (21 turns) | 33 | 0.329 |
| Two artifact cards | 2 | not logged per call; small |
| **Total** | | **about 1.3 of the 5.00 approved** |

## Acceptance outcomes
PASS = met; FAIL = run and not met; UNRUN = not run tonight. Unit cases are listed as "(unit)".

**A (brief)**
- §6.1 PASS: nanoGPT 1.1 has 4 beats, all anchored to the prepare script, `from` empty, `to` hands to 1.2.
- §6.2 PASS with a note. This plan's 2.1 is the 90/10 split, not the batch section the spec assumed. `from` picks up encode/decode; nothing is re-taught; no material.
- §6.3 PASS (unit).
- §6.4 PASS: datasette 1.1 is anchored to datasette paths, with nothing about models.
- §6.5 PASS: 0 searches; at most US$0.067 per section.
- §6.6 PASS (`grep-gate.txt`).
- Extra: datasette 1.2 FAIL (above).

**B (compose)**
- §6.1 PASS: every beat covered; at most 8 items; commands from the section set, which is stored as `toolsOffered` on the row.
- §6.2 PASS: 2.1 has things to try (notebook, code) and things to look at (written explanation; with N there is no visual `explain`). No found material; `why` on all items.
- §6.3 N/A: with N, `explain` is out of the section set whatever the flag.
- §6.4 PASS (unit).
- §6.5 PASS: datasette 1.1 has no notebook and no torch.
- §6.6 PASS: at most US$0.028.
- Extra: nanoGPT 1.2 FAIL (above).

**C (make)**
- §1d.1 PASS at API level (card made with HTTP 200 and no click); browser UNRUN.
- §1d.2 PASS (the checks refused two prompts live).
- §1d.3 PASS (unit).
- §1d.4 UNRUN (browser ordering).
- §2c.1 PASS: nanoGPT 1.1 repository card at prepare.py 13-17 with range 14; lead present; no card cost.
- §2c.2 UNRUN: no beat had two anchors on one code item.
- §2c.3 PASS (unit, plus a real 24-line example).
- §2c.4 PASS (unit).
- §3e.1 UNRUN (no `source` notebook was composed).
- §3e.2 PASS: nanoGPT 2.1 `authored` notebook, 11 cells, markdown first and between cells.
- §3e.3 UNRUN (no `buildup`).
- §3e.4 and §3e.5 PASS (unit).
- §3e.6 UNRUN.
- §4d.1 PASS: every item has a lead; notes of 246, 234 and 292 words.
- §4d.2 UNRUN (no reading item).
- §4d.3 UNRUN (browser).
- §4d.4 PASS (unit).
- §5f.1, §5f.3 UNRUN (no video beat). §5f.2 PASS (unit).
- §6e.1 PASS (unit, rule only; not run on a real index). §6e.2, §6e.4 UNRUN. §6e.3 PASS (unit).
- §7f.1, §7f.2 UNRUN. §7f.3 PASS (unit).
- §8c.1 FAIL/UNRUN: the one diagram composed (datasette) was refused. §8c.2 PASS (unit).
- §9c.1, §9c.2 real UNRUN; §9c.2 PASS (unit); §9c.3 not built.
- §10f.1-3 UNRUN; §10f.4 not built.
- Everything the owner clicks (Accept, then Make section, then the cards on the canvas) is UNRUN e2e.

## Not built (one line each)
- Quiz (and other ordinary tools compose can choose) in Make: no module, so the item is skipped.
- C §5e, §10f.4: drop the item and re-run compose for that beat when no video or capture is found.
- C §6d fallback card without a highlight after a failed quote re-ask: skipped instead.
- C §9c.3 compose fit check for graph on a structure beat.
- Paper figure crop; second Wikipedia card for a second section of the same article.
- Placement beyond `besideSpot`; reading `made[]` back after a reload.
- Document anchors (headings) for non-repository sources.
- The "already knows" term check and the "no output claim" check in prose (no term list exists).
- No browser check of any kind (main's CLAUDE.md); no screenshots.

## Follow-up on the Reviewer's 10:50 rulings (2026-11-16, 10:40-11:00 PT)
Commits:
- 2bf5e00cd: the rulings.
- c7c382eef: the brief schema states the backtick rule, and each refusal names the token it found.

8878 is rebuilt with them (`owner/local` 6cdd6f127, `/library` 200). Rulings 1 to 8 are listed in BLOCKERS.md under "Resolved by the Reviewer, 10:50".

| Re-run | Result | Spend, US$ |
|---|---|---|
| datasette 1.2 brief, try 1 (rule in the validator only) | FAIL: bare code names in 5 beats, ideas over one sentence | 0.089 |
| datasette 1.2 brief, try 2 (same build) | FAIL: the same kinds of errors | 0.058 |
| datasette 1.2 brief, try 3 (rule in the schema, token named in the refusal) | FAIL on one error only: `beat b5: idea is one sentence of at most 200 characters`. No code-name errors. | 0.083 |
| nanoGPT 2.1 i1, rerun 1 | PASS: `/explain` slash made, balanced, 206 characters of context, lead present (`make/nano-2.1-i1-rerun1.json`) | 0.023 |
| nanoGPT 2.1 i1, rerun 2 | skipped: "prompt uses 65". The vocabulary size is computed at run time and is not in the anchored lines, so the number rule refused it. This is not a code-name refusal. (`make/nano-2.1-i1.json`) | 0.015 |

- Spend for the follow-up: about US$0.27. Running total: about US$1.57 of US$5.00.
- Acceptance changes:
  - C §1d.2 still PASS.
  - The datasette 1.2 brief stays FAIL, now on the one-sentence rule only.
  - Compose of datasette 1.2 was not run (no brief).

## Follow-up on the Reviewer's 11:00 rulings (2026-11-16, about 11:30 PT)
Commit 042b46853. 8878 is rebuilt (`owner/local` 6d84696a5, `/library` 200).

| Re-run | Result | Spend, US$ |
|---|---|---|
| datasette 1.2 brief, try 1 (`brief/data-1.2-1100-try1.json`) | FAIL: bare setting names in `shows` (`default_page_size`, `hash_urls`, `config_dir`); three ideas over 2 sentences or 220 characters | 0.090 |
| datasette 1.2 brief, try 2 (`brief/data-1.2.json`) | FAIL: the same kinds of errors: `default_page_size` in b1 `shows`, `config_dir` in b5, three ideas over the limit | 0.083 |
| datasette 1.2 compose | not run: there is no brief | 0 |
| nanoGPT 2.1 i1 (`make/nano-2.1-i1.json`) | PASS: `/explain` slash made. Its numbers are 1,115,394 and 90%, both from the lines and the brief. | 0.021 |

- **The record path is not shown end to end.** The nanoGPT evidence canvas's repository (`repo-9591be45-nanogpt`, id 36) has no rehearsal record in R2. Records are keyed per repository id, and this one was never rehearsed. So the i1 run had no RECORDED RUN lines, and this PASS does not test the 11:00 number rule.
- **What the record path does have:** unit tests (`test/learn-section-record.test.js`, plus a number from the record accepted in `test/learn-section-make.test.js`), and an offline render of a real nanoGPT record and its artifacts zip from local R2 (repository id 13). That render gives `vocab size: 65`, `train has 1,003,854 tokens`, the losses at step 2000 and the step times.
- **The datasette 1.2 brief keeps failing on model output** after the loosened rule. The model writes setting names without backticks, though the schema and the re-ask both state the rule, and it writes ideas longer than two sentences.
- Spend for this follow-up: about US$0.19. Running total: about US$1.76 of US$5.00.

## Follow-up on the Reviewer's 11:15 rulings (2026-11-16, 11:20-12:00 PT)
Commits:
- 13f79a030: the rulings. `shows` may name what the anchored lines spell, bare or in backticks; ideas are at most 2 sentences and 260 characters; the overlay sentence is added.
- bc6f51a96: a refused brief logs the brief as returned, in `submitted`.

| Run | Result | Spend, US$ |
|---|---|---|
| datasette 1.2 brief, the ruled re-run | FAIL. b1 `shows` names `DEFAULT_SETTINGS["num_sql_threads"]`, which is not in the lines. b2 `idea` has a bare `config_dir`. b3 `idea` names `inspect-data.json`. b3 `shows` names `files=["a.db"]`. b4 and b5 ideas are over the limit. The brief was not returned, because the logging change was not built yet. | 0.092 |
| datasette 1.2 brief, capture run (`brief/data-1.2.json`, `log[0].submitted`) | FAIL. The b2, b3 and b4 ideas have 3 sentences each. b3 `shows` names `self.` and `SETTINGS`, which its one anchored line (app.py:410) does not spell. The beats as returned are in the file, for the Reviewer's overlay rewrite. b3's `shows` also says "I have not read these lines yet, so check them yourself." | 0.065 |
| Rehearsal, evidence nanoGPT canvas (`repo-9591be45-nanogpt`, route `shakespeare_char_cpu`) | ready in 187.5 s, 3 steps | 0.089 model. The sandbox cost was not yet in Modal's billing report at 11:14 PT. |
| nanoGPT 2.1 i1 (`make/nano-2.1-i1.json`) | PASS on the first call. The prompt says "the 65-character vocabulary". 65 is in neither the brief, the composition nor prepare.py 37-40; it is in the recorded run only. | 0.016 |

- The RECORDED RUN lines the request carried are in `make/nano-recorded-run.txt`. They were rendered by the same `recordedRun` from the same R2 objects (repository id 36, commit 3adf61e). The server does not log the message itself.
- Spend for this follow-up: about US$0.26 (model). Running total: about US$2.02 of US$5.00, plus the rehearsal's sandbox cents.
