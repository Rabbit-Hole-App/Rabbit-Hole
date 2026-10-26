# Independent re-review (round 2): prod-telemetry.sh safeguards (2026-10-26)

Reviewer: the same independent reviewer as round 1 (`safeguards-review.md`, file `063cade43b26b763...`). Scope as requested: the diff, the new P6/P9 rule, the
owner's eight requirements. Claims are judged against the stated scope: ACCIDENTAL execution and configuration mistakes, not a determined same-user process.

**VERDICT: safe to authorise further production Telemetry mutations: YES AFTER FIXES (R1 guard rollback L3 against deleting the pre-existing owner secret; R2 correct the
comments that still claim a controlled environment; R3 confirm and document the gate dispatch ref that the new check hard-codes).** No blocker. F1-F7 are fixed as stated.

## What I did and did not do

* File under review: `prod-telemetry.sh`, 649 lines, `bash -n` ok, sha256 `195fc198f9efc5a2a6a40b8194a39121cc3341098d921089f656c0d94f01f8b6` (matches the request, `lane-state.md`
  and `evidence/last-run.txt`; re-checked unchanged after my runs, as were the state, log and next files).
* NOT done: no execution of `prod-telemetry.sh` (not even `--dry-run`), no wrangler/fly/gh/curl, `small-deploy/.env` not read.
* Read in full: the script, `make-prod-candidate.sh`, `make-harness-copy.sh`, `FOLLOWUP-allowlist.md`, the README, `run-tests.sh` (H, K, O, S sections), the stub wrangler discovery emulation, `evidence/last-run.txt`
  and the `.result` files (sums: 271 scenarios, 1070 checks, 0 failed, 1 skipped: they add up), the scenario list in the worker logs, `day-1021/rel-after-gate.sh`, the repository workflows, and (grep only) wrangler 4.150.0
  `cli.js`.
* Computed by me: the manifest of `vendor/wrangler-4.150.0` using the script's own `MANIFEST_JS` (node, read-only): `9357e190dca5615cee5627d54091358201731ce9f56d1a889e997eeaf18826ae`, 1606 files, equal to `WR_MANIFEST`;
  `wrangler-dist/cli.js` in the vendor equals the one I hashed last round (`71da1f9b...`), the launcher equals the old pin (`780661a5...`); no symlinks; no `node_modules` directory in any ancestor of the vendor tree.
* Positive and negative control for `CFG_JS` (F7) against the REAL config: I took `wrangler.rabbit-hole-prod.jsonc` from `rabbit-hole/main`, produced the candidate with `apply-telemetry-bindings.mjs prod <adopted uuid>` in a scratch directory and ran the
  script's own `CFG_JS`: `diff` mode on (candidate, parent) exit 0; `head` mode exit 0; parent as candidate exit 1; a wrong uuid exit 1; a candidate with one extra unrelated edit exit 1. (Scratch removed.)
* Dynamic: I ran two groups of the existing harness as workers into my own output directory (`run-tests.sh --worker K` and `--worker O`; env -i, stub PATH, temp HOME, copies only): K (START-only, missing and partial resources, a real kill after `d1 create`) 11 scenarios, 43 checks passed, 0 failed;
  O (offline dry-run, terminal requirement) 14 scenarios, 56 passed, 0 failed. Both equal the recorded evidence. I did not rerun the full 56 minute harness; I relied on the recorded run for the other 15 groups.

## Findings, ranked

### BLOCKER
None.

### SHOULD FIX

**R1. Rollback L3 deletes the pre-existing production `SUBSCRIPTION_OWNER_EMAIL`, which is the path the owner rule forbids replacing.**
Evidence: `prod-telemetry.sh:627` `confirm "REMOVE OWNER SECRET"; wr_mut secret delete SUBSCRIPTION_OWNER_EMAIL --name "$WORKER"`. P6 now skips an existing secret (505-510), and that secret pre-existed this deployment with an unknown value; the script itself lists other consumers
(`owner-guard.js ownerOnly()`, `subscription-transport.js`, `learn-next-steps-routes.js`, 559). L3 is described as "the owner dashboard then answers 404 to everyone", which understates the effect: it removes the owner gate of those other features too. Delete (L3) followed by a later phase B (P6 absent branch, 515-523) is a
replace across two runs, each typed, but it is exactly the overwrite the owner decided against. The only test of L3 is a positive control (`RB3-L3-confirmed`).
Change: in the L3 branch require that this script created the secret: `[ "$(val P6)" = set ] || die "L3: SUBSCRIPTION_OWNER_EMAIL was not created by this script (P6 is '$(val P6)'); remove it by hand if you really intend that"`, and add the consumers to the L3 text. Add a harness scenario: state `P6 present`, `rollback L3` typed correctly: expect refusal and zero `secret delete`.

**R2. Comments and header text still claim more than the denylist delivers.**
Evidence: `prod-telemetry.sh:45` "nothing in the environment can redirect a binary or a path, or answer a prompt"; `46-47` "refuses to start if one is present, so a stale or leaked variable can never silently change what it does" (false for any variable not on the list: LANG/LC_*, MSYS*, OPENSSL_CONF, TEMP/TMP, HOME, PATH, and every spelling the patterns miss, which `FOLLOWUP-allowlist.md` itself says); `39-40` "Both are scanned ... after every step" (the scan runs inside `die` and the EXIT trap only).
The README and `FOLLOWUP-allowlist.md` are honest; the script's own comments contradict them and are what the next reader sees first. Change: say "denylist, not a controlled environment" at 45-47 and "at each stop and at exit" at 39.

**R3. The gate-run check hard-codes `head_branch == parallel/gate-sharded`; confirm that is how the integrator will dispatch, and say so.**
Evidence: `prod-telemetry.sh:478` `[ "${parts[5]:-}" = parallel/gate-sharded ]`. `gate-sharded.yml` is not on `main` (only `deploy-dev`, `deploy-prod`, `fast-e2e`, `verify`); it exists on `parallel/gate-sharded` and `-next`. Past dispatches in `day-1021` used `gh workflow run gate-sharded.yml --ref fix/ctrlk-gate-selection -f app_sha=... -f app_tree=...`
(a feature branch that carries the workflow), which this check would refuse. A refusal is fail-closed (good), but if the integrator dispatches from another ref the owner will be tempted to edit the script. `parallel/gate-sharded` is also 9 hours older than `parallel/gate-sharded-next` (Oct 13 09:55 vs 22:03).
Change: print the required dispatch (`gh workflow run gate-sharded.yml -R Rabbit-Hole-App/Rabbit-Hole --ref parallel/gate-sharded -f app_sha=<candidate> -f app_tree=<tree>`) in `pause_message` and the README, and confirm with the integrator that this branch carries the gate that has been accepted for releases. Also add the stated caveat to README item 8 (the preflight APP_SHA is read from the artifact NAME; the branch is a mutable name): it is in the request's "known limits" but not in the README.

### NOTES

* **N1. `resume --candidate --dry-run` runs for real.** The value parser (`prod-telemetry.sh:97`) takes the next argument as the value, so `--dry-run` becomes `CAND` and the run is not offline: it needs a terminal, loads the token and reads production, then refuses at the 40-hex test (586) before any change. `provision --gate-run --dry-run` is worse (phase A would proceed to the typed `ADOPT`). No mutation without the typed phrase, but a user who believed they were offline loaded the token. Change: reject a value that starts with `--`.
* **N2. wrangler flags on create calls.** `wr_raw` (187) now appends `--config none.jsonc` to every call without its own `--config`, including `d1 create` and `r2 bucket create`; `prod-script-notes.md` says create with a JSONC config asks to "add it on your behalf" (default yes). Non-interactive that would edit the temp `none.jsonc`, harmless (it is deleted) and only reachable in an empty world, but it is untested on the real service. The same applies to `--env-file empty.env` / `--config none.jsonc` on every other subcommand: I verified from `cli.js` that an explicit `--config` skips the walk-up (`resolveWranglerConfigPath`, `findWranglerConfig` is only the fallback) and that explicit `--env-file` replaces the default `.env`/`.env.local` list (`getDefaultEnvFiles` is only used when `args["env-file"]` is unset, `cli.js:366609`), and that both are global options; I could not run it. Any rejection fails closed (every call dies), so the first real `--preflight` is the test.
* **N3. F4 TOCTOU, stated precisely.** `wr_verify` hashes 162 MB in about 2 to 4 s (measured 1.9 to 3.7 s here) and wrangler is started afterwards; a same-user write during that time, or while wrangler lazily loads, is not caught. The README says what it does not cover (node, OS, coreutils, same-user processes) but does not name this window. Optional dependency fall-through to an ancestor `node_modules` is possible in principle; none exists in any ancestor today.
* **N4. Empty-world detection.** The first-time path (`phase_a` 341-344) decides "nothing exists" from `d1 list` (paginated, verified) and the unpaginated `r2 bucket list`. A bucket missing from the first list page plus an absent D1 reaches `GO PROVISION`, then `r2 bucket create` fails on the duplicate and the run stops with a D1 and no state of the bucket. Fail-closed and typed, so not a safety defect. Optionally also die if `bucket_exists` (exit status of `r2 bucket info`) says it exists.
* **N5. "No tool call" in the offline dry-run.** True for node, gh, curl, git, wrangler (the O group records zero); coreutils (grep, cut, tr, date) run from PATH, and the EXIT trap runs `scan`. Wording only.
* **N6. Denylist reach** (accepted as deferred): not covered `OPENSSL_CONF` (node loads it), `MSYS*`, `LANG`/`LC_*`, `TEMP`/`TMP`, `HOME`, `PATH`. The owner's terminal may carry listed names (for example editor-injected `GIT_ASKPASS` or `NODE_*`): the script then refuses and prints the name; harmless, but expect it on the first run.
* **N7. Gate evidence is still self-asserted by a mutable branch.** The new checks (name, completed success, path, event, branch, repository, both artifacts, gate.log tree and `-DONE`) are the pipeline's own method (`rel-after-gate.sh`: `head -5 | grep "index $TREE"`, `tail -1 | grep -- -DONE`) and close the round-1 gap for mistakes. The newest `deploy-prod.yml` run (which enforces the gate note, verify and fast-e2e) remains the load-bearing proof, and the output says so (493).
* **N8. Half-provisioned world is a dead end by design.** A D1 without a bucket or without migrations fails `verify_adopted`; neither the script nor a re-run completes it. K3, K3b, K4, K5, K6 prove it refuses; the owner would need the integrator. Fine, but say it in the pause text.
* **N9. `make-prod-candidate.sh`** is now a true dry run (`DRY=1` exits at line ~14 before fetch/worktree/edit; F13 executes it under stub git and node and sees only `rev-parse` and `grep`). It reads `DRY` from the environment: a stale exported `DRY=1` makes a real run silently dry (fail-safe). No credential access; the pushed branch triggers only `verify` and `fast-e2e`.
* **N10. Principal in logs.** `OWNER_PRINCIPAL` is printed with `echo`, never `say`, and not in any `die` text, so it never reaches the state or log; if it ever did, `scan`'s e-mail pattern would flag it and the run would exit 3. Good.

## The eight requirements

**(1) F1: a START record alone never authorises a mutation. HOLDS.**
`prod-telemetry.sh:346-351`: `if [ "$DRY" != 1 ]; then ...; confirm "GO PROVISION"; has START || mark START; fi` runs on every non-preflight run that passes line 342 (no ADOPTED, no P1, no D1 of that name) and 344 (no bucket listed). No other line reads `has START` (grep). `confirm` (238-242) goes through `ask` (129), which dies without `HAVE_TTY`. P4 asks `APPLY` unconditionally (386). Create calls: 357, 366, 387 only.
Cases: START only, empty world (K1, K1b no terminal, K1c wrong phrase); P1 recorded but D1 gone (K2: `adopt_flow` then `verify_adopted` dies 306); D1 only with or without START (K3, K3b), bucket only (K4, A7, line 344); half-applied migrations (K5: the `d1_migrations` read or the schema compare dies 315-320); killed after `d1 create` and resumed (K6: D1 present, uuid differs from `ADOPT_UUID`, refuses 306); truncated state line (K7). I reran K: 43/0.
Residual: "empty world" rests on two list calls (N4); each create still needs the typed phrase and Cloudflare rejects duplicate names.

**(2) F2/F3: terminal-only answers; offline `--dry-run`; authenticated `--preflight`. HOLDS in code; the real `/dev/tty` branch CANNOT TELL (never executed by any test).**
* Terminal only: `exec 3<&-` first (91), then `/dev/tty` only if stdin is a terminal (92); the only `read` in the file is in `ask` (129; grep confirms one `read -r`); `ask` refuses without `HAVE_TTY`. An inherited `3<file`, pipe, here-string, file, argument or variable cannot answer (T-*, H-inherited-fd3; H-fd3-closed-by-the-production-block runs the extracted TTY block alone). A pty wrapper is not detectable (stated in the script header 14-16, README and request).
* Offline: `--dry-run` sets `OFFLINE=1`; the block at 133-161 prints from arguments and the local state file and `exit 0` before the tools section (165), before `load_cf` ever runs (only `p0` calls it) and with `CF_TOKEN` empty. O group (reran: 56/0) records zero tool calls; N5 on wording.
* Preflight: `--preflight` sets `DRY=1`, `OFFLINE=0`; line 101 requires `HAVE_TTY`; line 102 prints "PREFLIGHT: this READS PRODUCTION"; every wrangler call goes through `wr_ro` (an allow-list, refuses everything else) or `wr_mut`, which dies under DRY (219); `http_post_probe`, `local_write`, `say`, `mark`, `confirm`, `attest`, `p6`, `p9` and every rollback branch are guarded. Both flags together exit 2 (99). `git fetch` in the migrations checkout, `gh run download` into the temp directory, and wrangler's own log/metrics still happen and are disclosed (README).
* Not tested anywhere: `[ -t 3 ]` and the `/dev/tty` open in the owner's terminal. Failure is closed ("run this in an interactive terminal"); the owner should start with `--dry-run`, then `--preflight`, in that terminal.

**(3) F4: manifest claim. HOLDS (accurate, not overstated), with the window of N3.**
Covers: launcher, `wrangler-dist/cli.js`, the whole 1606-file vendored tree (path, size, sha256 of every file, non-files counted), recomputed in `wr_raw` before EVERY execution (186) and once more before the version probe (191). I recomputed the manifest: equal to `WR_MANIFEST`, 1606 files. Outside it, and said so in the header (18-21), README item 4 and the limits: node itself (used both to compute the manifest and to run wrangler), OS, coreutils, gh/git/curl, same-user processes (they can edit tree and pin together). The H-swap-after-first-call scenario shows a change between two runs is refused. Not atomic with execution (N3).

**(4) F5: denylist, honestly labelled. HOLDS for the documents; the script's comments overstate (R2).**
Header 18-19 "a denylist, not a controlled environment"; 54 "This is a denylist; the allow-list design is in test-harness/FOLLOWUP-allowlist.md"; README item 2 "DENYLIST. It is not a controlled environment ... DEFERRED"; `FOLLOWUP-allowlist.md` states the claim is "accidental overrides are refused; a controlled environment is NOT provided", lists the five steps and why item 1 needs the owner machine. Nothing says "allow-list" as a current feature. Mechanism is real: case-insensitive (`${_n^^}`, 56), the added families, `BASH_ENV`/`ENV` even if empty (52), `trap -p` (50), aliases (51), exported functions (49); tests H-* and R-*. Overclaiming comment lines: R2.

**(5) F6: explicit config/env, empty cwd, hostile-parent test. HOLDS (the test is real; real wrangler untested, N2).**
`TMPW=$(mktemp -d)`, `WRDIR=$TMPW/wr` holding only `none.jsonc` and `empty.env` (170-172); every wrangler call except `--version` gets `--env-file empty.env` and, unless it brings its own, `--config none.jsonc` (187); evidence files live in `$TMPW/ev`, outside the cwd (458). I confirmed in wrangler's source that the walk-up (`empathic up()` over cwd and every ancestor) and the `.env`/`.env.local` load are exactly what the stub emulates (stub lines 18-23), that explicit `--config` and `--env-file` bypass them, and that the scenario puts a hostile `wrangler.jsonc` and `.env` in `$T`, `$T/tmp`, `$T/home` and the old scratch dir with a positive control (`H-control-hostile-detection`: the emulation does report them when the flags are missing) and flag/cwd assertions on every recorded call. The scratch dir for the (unreachable) provisioning path must hold nothing but `prod.jsonc` (376).

**(6) F7: candidate, gate, release config. HOLDS, with R3 and N7.**
* Candidate = parent + exactly three additions: `CFG_JS` compares parsed, canonicalised JSON (`same(strip(c), p)`, 452) after requiring the parent to hold none of the three (`!hasT(p)`) and the candidate's entries to equal the expected objects exactly (440-449); `files == CFG_PATH` and one parent (462). My control against the real main config: pass, and three failure cases fail correctly.
* Gate: name, `completed`, `success`, workflow path prefix, event, branch, repository, both artifacts by name and not expired (473-478), and the downloaded `gate.log` must carry `index <candidate tree>` in its first 5 lines and end with `-DONE` (481-487, the pipeline's own test). The preflight APP_SHA is read from the artifact name (stated caveat; run inputs are not in the API run object). Branch pinned to a mutable name (R3).
* Release: newest `deploy-prod.yml` push run on main must be `completed success` on a commit containing the candidate (490-494), and `cfg_check head` is applied to the file at that released commit (496-498).

**(7) New P6/P9 rule. HOLDS for P6 and P9; the L3 delete is the one gap (R1).**
`p6` (502-530): names-only `secret list` (504); if `SUBSCRIPTION_OWNER_EMAIL` exists it prints SKIPPED, `mark P6 present`, `return` (505-510) BEFORE the only `secret put` of that name (523). No `OVERWRITE` text or path anywhere (grep; S36 asserts it). Only when absent: hidden prompt via `ask -s` twice (515-516), whitespace trimmed, mismatch refused (518), the Gmail address refused case-insensitively (519), shape `^user@[0-9a-f]{32}\.rabbithole\.invalid$` (520) and then equality with `OWNER_PRINCIPAL` (521), which matches the repository's `auth.js:76` form; then `wr_mut secret put` with the value on a pipe from the `printf` builtin, output masked (525), name re-verified (527). Whether the 32-hex id is the owner's real id cannot be verified from here (it lives in production data).
`p9` mismatch (554-561): the pasted body must equal `{"owner":true,"configured":true,"environment":"production"}`; otherwise it prints "MISMATCH ... does NOT fix it and never replaces SUBSCRIPTION_OWNER_EMAIL", "A SEPARATE corrective action is needed", names the consumers and `die`s with the same phrase; nothing is recorded, no secret call. Tests C-P6-* (exists-skipped, no-overwrite-path, four mismatch bodies, no-terminal, all refusals of non-principal forms) pass in the recorded run.

**(8) Residual limitations stated honestly. HOLDS (small gaps listed).**
Stated in the header (14-16), README "Scope of every claim" and "What is not isolated", and the request: a same-user process or pty wrapper can answer prompts, read the credentials and run wrangler; Windows Git Bash has no network or file namespace (PATH + stubs + node wrapper; `perl.exe`, `ssh.exe`, `/dev/tcp` exist; the README now says the node wrapper allows any `node -e`); the real `/dev/tty` branch is untested; denylist not allow-list; PATH, coreutils, node undefended; `r2 bucket info` on a missing bucket unobserved; preflight does `git fetch`/metrics; F9 skipped; scope is accidental execution. Small gaps: the F4 window (N3); the gate-binding caveat missing from README item 8 (R3); the empty-world detection limit (N4).

## Residual limitations (for the owner)

* A process running as your Windows user can read `small-deploy/.env`, run the vendored wrangler itself, edit the script or its manifest, or drive a pseudo-terminal (script, winpty, expect, ConPTY) and type the phrases. Nothing in the script or the harness stops that; only keeping the token out of such a process's reach would.
* The terminal branch (`/dev/tty`, `-t 3`) has never been executed by a test. First run: `--dry-run`, then `--preflight`, in the terminal you will use.
* The environment check is a denylist; the allow-list is deferred and needs a read-only trial on your machine.
* Windows Git Bash gives no network or file isolation to the harness; isolation is PATH stubs and `env -i`.
* The real wrangler has not been run with `--config none.jsonc --env-file empty.env` on every subcommand; the first `--preflight` tests it.
* Gate evidence is bound by workflow facts, artifact names and the gate.log tree, not by run inputs; the release run is the load-bearing proof.

## What I could not verify

The real `/dev/tty` branch; real wrangler behaviour with the new flags on each subcommand and `r2 bucket info` for a missing bucket; whether the owner principal id is the real production id; which ref the integrator dispatches the gate from; the 15 harness groups I did not rerun (I relied on the recorded evidence for sha `195fc198`); Cloudflare list page sizes; the Cloudflare audit log.

---

# FINAL addendum (round 3, 2026-10-26): confirmation of R1, R2, R3, N1, N3 on the final revision

**FINAL VERDICT: safe to authorise further production Telemetry mutations: YES.** (No fixes outstanding; the notes below are optional.)

Final file: `prod-telemetry.sh` sha256 `09fe1c93921b783affc81be04c39f49f3653dfe5caff2da3b008c4710a70eace`, 656 lines, `bash -n` ok. Not executed; no wrangler/gh/curl; `.env` not read. State, log and next files unchanged (391 / 5404 bytes, 16:40 Oct 25).

**Method.** The 195fc198 file is not kept, so I could not run `diff`. I reread all 656 lines of the final file against my line-by-line reading of 195fc198 from round 2, and checked the line arithmetic: 649 + 7 = 656 equals the sum of the hunks below, with every other line identical (offset +3 before `p6`, +4 from `p6` to the end). Hunks found, and only these:

| Hunk | Lines (final) | Content |
|---|---|---|
| R2 | 39-40, 45-49 | comments: "scanned ... at each stop (die) and at exit"; REJECT block now "refuses to start when a KNOWN override-like variable ... is present", "a denylist, NOT a controlled environment: a variable that is not listed still reaches node, wrangler, gh, git and curl". The honest text now matches README and FOLLOWUP-allowlist.md. No code change in the block (57-65 equal to the old 55-63). |
| R3 | 82, 481-482, 484, 418 | `GATE_REF=fix/ctrlk-gate-selection` single constant; gate condition is now `event == workflow_dispatch` and `head_branch == "$GATE_REF"` (push and every other ref refused; path, repository, name, status, both artifacts unchanged); the refusal message names `$GATE_REF`; `pause_message` prints the dispatch command. |
| N1 | 100 | `--candidate`/`--gate-run` refuse a value beginning with `-` (exit 2, before any tool runs, `$2` set so no `set -u` fault); otherwise the same assignment and `shift` as before. Verified `resume --candidate --dry-run` can no longer turn into a real run. |
| R1 | 157, 628-634 | offline text for L3; the L3 text lists the other consumers; new guard `grep -q "^[^ ]* P6 set$" "$STATE" || die "L3 refused: ..."` runs before the dry-run branch and before `confirm`/`wr_mut`. It matches exactly the line `mark P6 set` writes (`<ts> P6 set`); `P6 present` and no record both refuse; the die text says nothing was deleted and to inspect consumers. |
| N3 | README only | hash-to-exec window named (README line 33), plus the R3 caveats in item 8 (artifact name, mutable ref) and the L3 rule. |

**No new override or prompt hole.** The terminal block, `ask` (still the only `read -r`), `confirm`, `wr_raw`/`wr_ro`/`wr_mut`/`gh_ro`/`git_ro`, `p6`, `p9`, `attest`, the offline block (still exits before the tools section), the first-time path (GO PROVISION unconditional), `CFG_JS` and the REJECT code are byte-for-byte what I reviewed. The two behavioural changes (refuse more: L3 guard, option-like values, stricter gate event/ref) can only fail closed.

**Evidence matches this exact sha.** `evidence/last-run.txt`: "production file sha256 09fe1c93921b783a", 283 scenarios, 1110 checks passed, 0 failed, 1 skipped (F9), 3170 s. The 17 `.result` files add up to 283 scenarios, 1110 passed, 0 failed, and the worker logs contain no failing check. I did not rerun the harness this round (the diff is confined to the hunks above and each has named tests: RB3-L3-refused-P6-present, -no-P6-record, -set-then-present, -wrong-phrase, -preflight-*, O-option-as-value-*, C-gate-run-old-ref-parallel-gate-sharded, C-gate-run-event-push, C-gate-run-is-another-branch, B2-resume-happy, S37-S40). The earlier K and O group reruns I did in round 2 were on 195fc198 and are superseded by the full run.

**R3 check.** `gate-only.sh` line 10 dispatches `gh workflow run gate-sharded.yml -R $R --ref fix/ctrlk-gate-selection -f app_sha=$SHA -f app_tree=$TREE`; that branch carries `gate-sharded.yml` (main does not). So the constant matches the procedure the integrator really uses. I did not query run 40257810296 (no gh call); that rests on the implementer's note.

**Optional notes (none blocks).**
* The accepted ref is a feature-branch name: if it is deleted or reused, phase B refuses (fail closed) and `GATE_REF` needs a reviewed edit.
* L3 passes on ANY earlier `P6 set` line, even after a completed L3 (`L3 done`) and a later hand-made secret; a second typed L3 would then delete that secret. Cheap tighten: refuse when `L3 done` follows the last `P6 set`. The state file is also writable by the same user (a forged `P6 set` line), which is outside the stated scope.
* All round-2 residual limitations stand unchanged: same-user process or pty can answer prompts; `/dev/tty` branch never executed by a test (start with `--dry-run`, then `--preflight`, in the terminal you will use); denylist not an allow-list; Windows has no namespace isolation; real wrangler untested with `--config none.jsonc --env-file empty.env` on every subcommand; owner principal id not verifiable here; gate evidence bound by workflow facts, artifact names and gate.log tree, not by run inputs.
