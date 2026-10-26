# Independent review: prod-telemetry.sh safeguards (2026-10-25, PT evening)

Reviewer: independent agent (did not write the script or the harness). Reviewed against main's CLAUDE.md (read from `rabbit-hole/main`, which now carries the
"enforced isolation" rule) and `day-1021/incident-telemetry-prod-2026-10-25.md`.

**VERDICT: safe to authorise further production Telemetry mutations: YES AFTER FIXES (F1, F2, F3, F4, F5, F6, F7 below).**
Nothing found lets today's state (adopted D1 + bucket exist, state file has P1) create or delete anything by accident, and the failure of the original incident
(test hook plus ambient credentials) is closed for the harness path. But the stated invariant "no Cloudflare change without a typed confirmation from a
terminal" is not true as written (F1), prompts can still be pre-answered through an inherited descriptor (F2), and the production entry point still loads real
credentials and talks to production for any non-terminal caller, including `--dry-run` (F3). The wrangler pin does not pin wrangler (F4). Fix those before the
owner runs phase B (P6 secret put). None of the fixes needs a design change.

## What I did and did not do

* Static only: read `prod-telemetry.sh` (519 lines), `make-prod-candidate.sh`, `make-harness-copy.sh`, `run-tests.sh`, all stubs, README, request, incident record,
  `diff` against the before-safeguards reference, `bash -n` (ok), `sha256sum`.
* The sha256 of the file under review is `063cade43b26b763...` (full `063cade43b26b763b9f1e171b67ec4c814adc6cd06a1f0080d215d144fb39ff9`), which equals the sha
  recorded in `evidence/last-run.txt`, so the recorded 653/0/1 harness result is for exactly this file.
* I did NOT execute `prod-telemetry.sh` (not even `--dry-run`), did not run wrangler / fly / gh / curl, did not read or print `small-deploy/.env`.
* I read (grep/sed only) the pinned wrangler source at `stack-c10/node_modules/wrangler/wrangler-dist/cli.js` and `.github/workflows` / `scripts` on `rabbit-hole/main`.
* I did NOT run the harness (no single scenario is selectable: the smallest unit is a group, `run-tests.sh --worker "<group>" <OUT>`, 10+ minutes, and the
  evidence file already matches the current file). I confirmed from the source that every copy runs as `/usr/bin/env -i PATH=<stubs>:/usr/bin HOME=<temp> ...`
  (`run-tests.sh:91-95`), that the production file is only read (`PROD` is used by grep/diff/sha256/make-harness-copy, never executed), and that the credentials file is fake.
* Three tiny standalone bash experiments (unrelated to the script, no credentials, no network; scratch files under `$TEMP/rv`, deleted) confirmed: an inherited
  `3<file` descriptor answers `read ... <&3` when stdin is not a terminal; a `BASH_ENV` file that runs `unset BASH_ENV` leaves `compgen -e` clean while installing a
  DEBUG trap that can set `HAVE_TTY=1`; and real `node.exe` on this machine honours a lower-case `node_options` that a case-sensitive `NODE_OPTIONS` pattern does not match.

## Findings, ranked

### BLOCKER (invariant violated on a path that reaches a Cloudflare mutation)

**F1. `GO PROVISION` is skipped whenever the state file already has a `START` line.**
Evidence: `prod-telemetry.sh:270` `if [ "$DRY" != 1 ] && ! has START; then ... confirm "GO PROVISION"; mark START; fi`, followed unconditionally by
`runlog wr_mut d1 create "$DB"` (281) and `runlog wr_mut r2 bucket create` (290). With a state file that holds `START` but not `P1`/`ADOPTED` (a run that died between
START and P1, a hand-edited or restored state file, or the lost-P1 case after `d1 create` succeeded but `d1 list` lagged: line 282 dies after `d1 create`) and a
`d1 list` that does not show the database, phase A reaches `d1 create` and `r2 bucket create` with no prompt and no terminal. The README claim "P1/P2/P4 are
reachable only when there is no state, no D1 and no bucket at all" is therefore also inexact: "no state" is really "no P1/ADOPTED line". Mitigations that make this
unlikely today: the real state file has P1 so `adopt_flow` runs (267); Cloudflare itself rejects a duplicate D1/bucket name; P4 still asks `APPLY` (309). No harness
scenario covers START-without-P1 (only `st_lacks START`, `A8` positive control).
Change: make the prompt unconditional: `if [ "$DRY" != 1 ]; then ...; confirm "GO PROVISION"; has START || mark START; fi`. Add a harness scenario: state = `P0`,`START`
only, empty world, non-terminal stdin and scripted stdin: expect refusal and zero MUT.

### SHOULD FIX (high)

**F2. Prompts can be pre-answered through an inherited file descriptor 3.**
Evidence: the TTY block (74-76) only (re)opens descriptor 3 when stdin is a terminal. When it is not, an inherited fd 3 stays open (`bash prod-telemetry.sh 3<answers`).
`confirm` (167) and `p6` (391) test `HAVE_TTY` first, but `attest` (411) and the P9 paste prompt (430) do not: they run `read -r ... <&3` unconditionally, so an inherited
fd 3 supplies `yes` and the exact JSON body. Consequence: the browser attestations (P9-owner / P9-page / P9-ordinary) can be recorded without a human, and phase B can
reach "TELEMETRY PRODUCTION VERIFIED". It does not by itself mutate Cloudflare, but it breaks "answers only from a terminal" and the harness (S6 only checks that every
`read -r` uses `<&3`, T tests never open fd 3) cannot see it. (I reproduced the descriptor behaviour in a standalone mimic.)
Change: first line of the TTY block `exec 3<&-` (close any inherited descriptor), and one helper `ask() { [ "$HAVE_TTY" = 1 ] || die "no terminal"; read -r "$@" <&3; }` used by
`confirm`, `p6` (with `-s`), `attest`, and the paste prompt. Update S6 to require that helper. Add T scenarios with `3<file` on non-terminal stdin for attest and paste.

**F3. The production entry point reads real credentials and contacts production for any caller, terminal or not, including `--dry-run`.**
Evidence: `load_cf` (171-179) runs from `p0` before any prompt; `--dry-run` is read-only but still authenticated against production (README "Dry-run"). Root cause 3 of the
incident was exactly "tests ran where the real credentials are readable". The harness now avoids that, but the file itself still lets any agent that runs it (even dry) read
production, and phase B with an already-set secret reaches `http_post_probe` (163, 422) without any typed input.
Change: right after the TTY block, `[ "$HAVE_TTY" = 1 ] || { echo "STOP: run this in an interactive terminal (all modes, including --dry-run)"; exit 1; }`. The harness copies
that use the scripted TTY block are unaffected; the "plain" non-terminal copies must now expect this message instead of "no terminal for the typed confirmation" (adjust
`tty_refused`). This makes the only way to touch production a terminal, which is what the owner rule says.

**F4. The "pinned wrangler" pins a 3 KB launcher, not wrangler.**
Evidence: `WR_SHA256=780661a5...` equals the sha256 of `node_modules/wrangler/bin/wrangler.js` (3088 bytes, verified). That file only `spawn`s
`../wrangler-dist/cli.js` (15 MB, sha256 today `71da1f9bcf69a9f56c4ff4f68e71315365d03db8ea11207577b47a8e1a0a1064`) which is not hashed, nor are its dependencies (workerd,
miniflare, esbuild, undici, all in `stack-c10/node_modules`). `stack-c10` is an agent working checkout (branch `stack/c10-checks`), so `npm install` there silently changes
the code that receives the Cloudflare token. `--version` (118) is answered by that same unpinned code. There is also a TOCTOU window: hash and version are checked once at
start (117-118) and wrangler is then executed up to ~10 times, across long interactive waits, without re-hashing.
Change: (a) hash `wrangler-dist/cli.js` and `package.json` too; (b) re-verify immediately inside `wr_raw` before each execution; (c) better, copy the exact wrangler tree to a
private directory outside every working checkout (read-only ACL, `npm ci --ignore-scripts` from a lockfile) and pin a manifest hash of that tree. State plainly in the README
that (a)+(b) detect accidental drift only.

**F5. The override rejection is a denylist, it is case-sensitive, and it cannot detect `BASH_ENV`.**
See question 2 for the list. Concrete defects: (i) names are matched case-sensitively (43-44) but Windows is case-insensitive: lower-case `node_options` is honoured by
`node.exe` here and passes; `wrangler_*`, `cloudflare_*`, `https_proxy` behave the same for node/wrangler; (ii) unlisted variables that change behaviour of the tools the script
runs (proxy / TLS / git / gh / npm / XDG); (iii) `BASH_ENV` is sourced before line 1, so a file that does `unset BASH_ENV` and installs a DEBUG trap or `exec 3<file` is invisible to
`compgen -e` (the trap persists and can set `HAVE_TTY=1`; I reproduced a DEBUG trap setting a variable). No in-script defence is complete there.
Change: make the match case-insensitive (`${_n^^}` in the `case`), add `GIT_*`, `*_PROXY`, `NODE_*`, `NPM_*`/`npm_config_*`, `SSL_*`, `CURL_*`, `XDG_*`, `GH_*`, `GITHUB_*`,
`DO_NOT_TRACK`, `TMPDIR`, `LANG`/`LC_*`; add at the top `[ -z "$(trap -p)" ]` and `! shopt -q expand_aliases` checks (cheap, they catch the BASH_ENV/DEBUG case). Then replace the denylist
by an allow-list (see question 2).

**F6. Wrangler runs in a directory whose configuration it discovers by walking up, and it loads `.env` files from the working directory.**
Evidence: `wr_raw` does `cd "$WRDIR"` (115) with `WRDIR=$SCRATCH` = `$HOME/rh-telemetry-prod`. In wrangler 4.150.0, `findWranglerConfig` (`cli.js:3539`, `empathic` `up()` at 3411) searches
`wrangler.json`, `wrangler.jsonc`, `wrangler.toml` in the cwd and every ancestor up to the drive root, and `loadDotEnv` (`cli.js:191238`, called at 366609) reads `.env` and `.env.local`
from the cwd. A stray config in `C:/Users/cyudhist` or `C:/`, or a `.env` in the scratch directory, can (a) make `d1 execute rabbit-hole-telemetry --remote` (240-241 `verify_adopted`) resolve a
different `database_id` than the one `d1 list` verified, and (b) inject variables the script rejects in the environment (`CLOUDFLARE_API_BASE_URL`, `WRANGLER_API_ENVIRONMENT`, `WRANGLER_LOG_SANITIZE=false`
which would write request bodies, including the owner email, into wrangler's debug log). The `HOME` override (not rejected, 111) relocates that directory.
Change: always pass `--config "$WRDIR/none.jsonc"` (a file containing `{"name":"x"}`, explicit config disables the walk) and `--env-file "$WRDIR/empty.env"` on every `wr_raw` call
unless the call already carries its own `--config`; use a fresh `mktemp -d` as cwd; die if `$SCRATCH` contains anything but `prod.jsonc`.

**F7. Evidence for the candidate is weaker than the text implies.**
Evidence (`evidence()` 355-384):
* "one commit changing only CFG_PATH" is checked (359), but the content check (360-368) only looks at the `TELEMETRY_DB`, `TELEMETRY_ARCHIVE`, `TELEMETRY_ENVIRONMENT`, `account_id`, `name` fields.
  Any other edit inside the same file (another D1 binding's `database_id`, `routes`, `main`, another var, a second R2 bucket) passes. Change: fetch the parent's file and require
  `candidate == parent + exactly the three additions` (deep-equal after removing the three keys, or regenerate with `apply-telemetry-bindings.mjs prod <uuid>` and compare bytes).
* The gate run is bound to the SHA only by the run name `sharded release gate` and an artifact name starting `r36-windows-gate-<sha>-` (375-376). That workflow lives on throw-away branches
  (`parallel/gate-sharded*`, not in `main/.github/workflows`), so name and artifact name are chosen by whichever branch produced the run; `head_sha`, `path`, `event`, `head_branch` are not
  checked, and the artifact content is not read. In practice the pipeline's own proof is stronger and already enforced: `deploy-prod.yml` requires the `refs/notes/dev-deploys` chain (which needs the
  `refs/notes/gates` note), verify and fast-e2e on the released commit (`deploy-prod.yml`, `deploy-dev.yml`). Check (382) "newest `deploy-prod.yml` run on main is success on a commit containing the candidate" therefore carries
  the real weight. Change: also require `.path == ".github/workflows/gate-sharded.yml"` and `.repository.full_name == $R` on the gate run, or drop the gate-run id and read
  `git notes --ref=gates show <release head>`; say in the output that the release run is the load-bearing check.
* The config is validated on the candidate commit, not on main's head or on the released commit; a later main commit can change the production config before the release run. Change: run the same
  config check on the release run's `headSha`.
* `fast-e2e` can be green with zero relevant checks (CLAUDE.md gotcha); acceptable here only because the config unit tests run in `verify`. Say so.

### NOTES (no action required to proceed, but fix when touching the file)

N1. **`bucket_exists` (185) uses `r2 bucket list`.** In 4.150.0 `listR2Buckets2` (`cli.js:214284`) makes one request with no `per_page`/cursor and no jurisdiction; the Cloudflare default page
    size is not verified by me. A false "absent" is fail-closed in `verify_adopted` (233) and harmless in provisioning because Cloudflare refuses duplicate names. Use `r2 bucket info <name>` (exact lookup, already on the wr_ro list). D1 listing paginates correctly (`listDatabases`, `cli.js:175549`).
N2. **`wr_ro` allows `d1 migrations list`, which is not read-only.** In 4.150.0 it calls `initMigrationsTable` (`cli.js:239579`, `CREATE TABLE IF NOT EXISTS`) on the remote database. Idempotent, only reached after `apply` (311), never in dry-run. Rename the comment or drop it from the read-only list.
N3. **Dry-run is not "creates and changes nothing".** `rh_check` runs `git fetch` in the `telemetry-bindings` checkout (200) which moves `rabbit-hole/main` there; wrangler writes debug logs under the user config directory and by default sends anonymous metrics to `sparrow.cloudflare.com` (`WRANGLER_SEND_METRICS` / `DO_NOT_TRACK`, `cli.js:25247-25251`, 304383). None touches production resources; the README sentence overstates.
N4. **`wr_mut` / `wr_ro` / `gh_ro` are guards against internal bugs, not security boundaries.** `wr_mut` accepts any target (`d1 delete *`, `r2 bucket delete <any>`, `secret put *`); `gh_ro` misses the short form `-fkey=value` / `-Fkey=value` (158); `wr_ro d1 execute` uses the first `--command` only. All callers pass constants, so no live escape, but do not describe them as an input filter.
N5. **PATH is not defended.** Only `node gh curl git cygpath sha256sum` are checked to be files (109); `sha256sum`, `sed`, `date`, `cut`, `mktemp`, `tee` and `node` resolve through PATH. A shadowing `node` receives the exported Cloudflare token (`export` in `load_cf`, 176) and the pinned-hash check is only as honest as `sha256sum`. Log `command -v` for every tool (only four are logged, 110) and call coreutils by absolute path, or accept this as out of scope for non-hostile callers.
N6. **The Cloudflare token is exported to every child** (176): `gh`, `git`, `curl` inherit it. Export it per call (`CLOUDFLARE_API_TOKEN=... wr_raw`) in `wr_raw` only.
N7. **Secret scan limits** (93-102): runs only inside `die` and the EXIT trap (the header, line 30, says "after every step"); a hit does not change the exit status (105); exact-length 40-character token rule only (a 37-hex Global API key, a 41+ character token, base64, split lines, `＠`/IDN/`%40` forms, `name at domain` pass); the owner e-mail is never written by the script, so the realistic leak path is wrangler output teed to the log by `runlog` (153), which is only d1/r2 create/migrate output.
N8. **Ordinary-account guard** (397) is an exact lower-case match of one address; plus-tag and Gmail dot variants of the same mailbox pass. It also hard-codes a personal address in a file under `C:/s/spec`.
N9. **Scratch-config TOCTOU in the (now unreachable) provision path**: `prod.jsonc` and the migrations directory are checked/written before the `APPLY` prompt and read by wrangler after it.
N10. **No lock** on the state file: two terminals can interleave `mark` lines and both pass a prompt.
N11. **Rollback L4** confirms with the database name (`DELETE rabbit-hole-telemetry`), not the uuid, and checks only main's config for a surviving binding, not the live Worker (503-504).
N12. **P9 contains a production write** (`http_post_probe`, empty `{"events":[]}`) that needs no typed confirmation; harmless, but not a "Cloudflare change" in the sense of `wr_mut`. Describe it as such.
N13. **The terminal-present branch is never executed by any test**: the scripted copies replace the TTY block with `HAVE_TTY=1; exec 3<file` and the plain copies have no terminal. The production block is checked only textually (S5, S7). First real run is the owner's; if `[ -t 3 ]` is false in the owner's terminal the script fails closed ("no terminal"). Ask the owner to start with `--dry-run` in the terminal they will use (after F3, which makes that the first thing that works).
N14. **Harness node wrapper** (`stubs/node`) allows *any* `node -e <code>` (`-e) ... exec REALNODE`), not "only inline JSON": the README sentence is wrong. Real `perl.exe`, `ssh.exe` (the stub names shadow `ssh` but not `ssh.exe`) and bash `/dev/tcp` exist on the harness PATH; none is used by the script. This does not meet CLAUDE.md's "no route to production" literally; it is PATH-level isolation (the README says so). For a stronger guarantee run the harness with Windows Firewall blocking `node.exe`/`perl.exe`, or in Windows Sandbox/WSL with networking off.

## Answers to the nine questions

**(1) Can the production entry point execute a Cloudflare mutation without an interactive typed confirmation from a real terminal? Verdict: DOES NOT HOLD (narrow).**
Holds against: stdin pipe, here-string, redirected file, `yes |`, `/dev/null`, process substitution (all make `[ -t 0 ]` false, `HAVE_TTY=0`; `confirm` 167 and `p6` 391 die), environment variables
(none is read; any suspicious name refuses, 41-50), arguments (unknown arguments exit 2, 81; no flag answers a prompt), exported functions (`declare -F`, 40, plus `BASH_FUNC_*`), `set -x`/`bash -x`/`SHELLOPTS`/`PS4`/`BASH_XTRACEFD`
(39, 43), `source`/`.` (34), `--dry-run` (every mutation passes `wr_mut`, 146, S9, S11), rollback L1/L3/L4 (each has `confirm` before `wr_mut`: 486, 497, 509, 512, 514), P4 (309).
Does not hold: F1 (`START` skips `GO PROVISION` before `d1 create` / `r2 bucket create`); F2 (inherited fd 3 answers `attest` and the paste prompt, not a Cloudflare change); F5 (`BASH_ENV` that unsets itself plus a DEBUG trap sets `HAVE_TTY=1`, or fd 3, before line 74; PATH
shadowing of `node` receives the token); and not detectable at all: a pty-allocating wrapper (`script`, `winpty`, `expect`, ConPTY/node-pty, Python `pty`, an agent tool with a pty option) or keystroke injection into a real terminal window. Everything printed in the prompt (the phrase,
the uuid) is visible to such a driver. The only real boundary against a deliberate or tool-driven bypass is credential custody: the token is a plaintext file the same Windows user can read, and any agent can run the same `wrangler` with it directly. Consider keeping the token out of the agent's reach (separate OS account, Windows Credential Manager/DPAPI with a prompt, or a hidden-prompt token for mutating steps).

**(2) Denylist, exhaustive?** Only a denylist. What it names: `TEL_*`, `BASH_FUNC_*`, `WRANGLER_*`, `CLOUDFLARE_*`, `NODE_OPTIONS/PATH/EXTRA_CA_CERTS`, `BASH_ENV`, `ENV`, `SHELLOPTS`, `BASHOPTS`, `PS4`, `BASH_XTRACEFD`, `CDPATH`, `CURL_HOME`, `GH_HOST/REPO/CONFIG_DIR`, `GITHUB_API_URL`, `GH_ENTERPRISE_TOKEN`, prompt-like words and old overrides.
Still able to change behaviour: `HOME` (read by the script, relocates scratch/cwd, git and gh config); `PATH` (N5); `TMPDIR`/`TEMP`/`TMP` (where `mktemp` writes); `GIT_DIR`, `GIT_WORK_TREE`, `GIT_SSH_COMMAND`, `GIT_CONFIG_*`, `GIT_EXEC_PATH`, `GIT_ASKPASS`, `GIT_EXTERNAL_DIFF`, `GIT_PAGER` (git can run arbitrary commands before any prompt and `GIT_DIR` points `rh_check` at another repository);
`HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`/`NO_PROXY` and `NODE_TLS_REJECT_UNAUTHORIZED=0`, `SSL_CERT_FILE`/`SSL_CERT_DIR`, `CURL_CA_BUNDLE` (man-in-the-middle of wrangler/gh/curl evidence, the Cloudflare token goes through them); `GH_TOKEN`/`GITHUB_TOKEN` (gh uses a different identity), `GH_PAGER`/`GH_PATH`; `NODE_*` others (`NODE_TLS_*`, `NODE_PRESERVE_SYMLINKS`, `NODE_REPL_*`), `NPM_*`/`npm_config_*`; `XDG_CONFIG_HOME`/`APPDATA` (wrangler/gh config dir); `DO_NOT_TRACK`; `MSYS`/`MSYS2_*` (argument path conversion); `LANG`/`LC_ALL` (sort/grep behaviour; it fails closed because outputs are compared by exact strings); and every lower-case spelling of the listed names on Windows (F5).
**Allow-list is better, and cheap:** the script reads only `HOME` and `PATH`. Replace the loop with: compute `compgen -e`, remove a fixed set of names the owner's terminal legitimately has (`HOME PATH TERM SYSTEMROOT WINDIR TEMP TMP USERPROFILE APPDATA LOCALAPPDATA PROGRAMDATA COMSPEC PWD OLDPWD SHLVL _ MSYSTEM ...`), and refuse on anything left, printing the names and the exact `env -i ... bash $0` command that works (about 10 lines). The minimum set needed by real wrangler/gh/git on this machine is something only a read-only trial by the owner can establish; the harness env (`PATH SYSTEMROOT WINDIR TEMP TMP HOME`) is enough only for stubs and inline node, not for real wrangler or gh. Keep the denylist as a second layer for readable error messages.

**(3) Pinned wrangler: TOCTOU, swap, config?** TOCTOU: yes (F4): hash/version checked once at 117-118, executed repeatedly, launcher-only hash, dependencies unpinned, directory is a live working checkout. Wrangler reads: `wrangler.json|jsonc|toml` walking up from cwd, `.env` and `.env.local` from cwd (F6), `~/.wrangler`/XDG config, `CLOUDFLARE_*`/`WRANGLER_*` (rejected in the environment, but injectable through `.env`), and metrics/log settings (N3). It can alter the DB/account for `d1 execute` and `d1 migrations` via config entries, and the API base URL via `CLOUDFLARE_API_BASE_URL`. **Verdict: does not hold** as a pin; holds as an accidental-drift check of the launcher only.

**(4) wr_mut / wr_ro coercion.** Allowed read commands cannot be coerced into a write through the script's own call sites: `d1 execute` requires `--command` as a separate token, a `--remote` substring, `^\s*select\s` and no `;`; `--file` alone leaves `cmd` empty and is refused; `--command=...` form is refused (fail closed); SQLite has no statement separator other than `;`, no PRAGMA/ATTACH/DELETE/WITH starts with the `select` prefix check, a newline between statements without `;` is a syntax error, URL-encoded `%3B` is just text. Weak spots, none reachable from the constants the script passes: `[[ "$*" == *" --remote"* ]]` matches inside the SQL text, only the first `--command` is inspected (N4), `d1 migrations list` writes (N2). `wr_mut` lists eight subcommands and accepts any target (N4). **Verdict: holds for the script's own calls; not an input filter.**

**(5) Dry-run: every side effect behind the DRY guard?** Mostly yes: `say` (85), `mark` (86), `local_write` (89), `die` log (104), `mkdir` (112), `wr_mut` (146), `http_post_probe` (163), `confirm` (166), `attest`/paste/`p6` prompts (410, 428, 390), L1/L3/L4 branches (486, 497, 508), `pause_message` write (341). Exceptions (N3): `git fetch` in the RH checkout, wrangler debug logs and anonymous metrics, `mktemp` files (removed), and the credentials are read and used against production (F3). `make-prod-candidate.sh` is not dry-run safe either (question 8). **Verdict: holds for Cloudflare and GitHub mutations; does not hold for "changes nothing".**

**(6) Adoption and resume.**
* Wrong database: no. Phase B and the adoption phrase use the constant `ADOPT_UUID` (231, 255, 460); a state `P1` that differs refuses (229). A forged `ADOPTED`/`PAUSED` can only skip the typed ADOPT phrase; phase B then re-runs `verify_adopted` against the live account (455). **Holds.**
* Skipping a check via state: `P9-owner`, `P9-page`, `P9-ordinary` ("already recorded", 409, 427) and `CANDIDATE` pin come from the state file, so a stale or forged file skips the owner's browser attestations; they are not tied to the candidate that produced them except by the `CANDIDATE` pin (459). `P6` is decided from the live secret list, not state (good). **Partly holds.**
* Re-running P1/P2/P4 on a transient failure: API errors are fail-closed everywhere I traced (`wrq` returns the code; `d1_uuid` pipeline has `pipefail`; `|| die` on 230, 233, 234, 236, 240, 241, 266, 388). A successful but incomplete answer (eventual consistency right after create, R2 list page size) can reach P1 only through F1 or an empty state; Cloudflare then rejects the duplicate name. **Holds after F1**; today it fails only through F1.
* Phrase tied to the uuid: yes, constant (255). Account tied: `p0` whoami must show exactly the one account (191) and `CLOUDFLARE_ACCOUNT_ID` must equal it (178).
* Candidate and evidence strength: see F7. The candidate SHA must be 40-hex (456) and is pinned in state once evidence passes (459, 466); not re-pinned by a different gate-run. The release-run and main-contains checks are sound (`compare` status `ahead|identical`, 348; newest `deploy-prod.yml` push run on main must be success and contain the candidate, 380-383). **Artifact name alone is not sufficient** (F7).

**(7) Secrets.** Hidden prompt: `read -r -s` on the terminal descriptor, twice, `printf` builtin into the pipe so no argument or environment carries the value, variables unset, wrangler output filtered before display and never logged (386-406). No secret in state/log by construction; the scan is defence in depth with the false negatives in N7. Risks to name: the token is in the environment of every child (N6); wrangler's debug log is sanitised by default but F6 shows a `.env` can switch that off; the typed e-mail remains in terminal scrollback (not a script matter). The Cloudflare token comparison through a process substitution keeps it out of argv (100). **Holds, with N6/N7.**

**(8) `make-prod-candidate.sh`.** Cannot reach production resources: it creates/updates a worktree and branch `feat/telemetry-bindings-prod`, edits one file, runs three local node tests, commits and `git push -u rabbit-hole feat/telemetry-bindings-prod`. The pushed branch triggers `verify` (branches-ignore main) and `fast-e2e` (branches-ignore main, dev) only; `deploy-dev.yml` fires on `dev` and `deploy-prod.yml` on `main` (verified in the workflows). Notes: `DRY=1` is read from the environment and is not dry for the repository (it fetches, creates the worktree and the `mklink` junction before the DRY test, 18-22); `git grep` errors at line 27 are treated as "not found" (fail-open, later steps would still fail); the uuid is not compared to `ADOPT_UUID` here (caught later by `evidence`). It reads no credentials. **Holds.**

**(9) README limits: do they understate risk?** Yes, in these places: "node runs wrangler ... only after its sha256 ... match" (F4: launcher only); "the script reads no environment variable at all except HOME and PATH" (true of the shell code, not of node, wrangler, git, gh, curl, mktemp which inherit everything: F5/F6); "a pipe ... or a variable cannot answer" (inherited fd 3 can, F2; BASH_ENV can, F5); "P1 / P2 / P4 are reachable only when there is no state, no D1 and no bucket at all" (F1); "--dry-run ... creates and changes nothing" (N3); "allows only inline JSON code" (the node wrapper allows any `-e` code, N14); "isolation ... no route to production" (PATH-level only; README is honest about Windows, but CLAUDE.md asks for no route); "Last full run ... (about a few minutes)" vs 1856 s. The limits list omits: no test of the real terminal branch (N13), lower-case environment names on Windows, the gate-run binding weakness, and that the token file is readable by any agent of the same user.

## What I could not verify

* The real terminal branch (`/dev/tty` open, `-t 3`) in the owner's terminal; Git Bash/mintty/ConPTY behaviour (cannot create a pty here).
* Which environment variables real wrangler/gh/git need on this machine (needed to build the allow-list).
* Cloudflare API page sizes for `r2/buckets` and whether a freshly created D1/bucket can be briefly missing from list calls.
* Whether `wrangler` honours `--env-file`/`--config` as proposed in F6 on every subcommand used (source shows the global flags; I did not run it).
* The content and trust of the gate artifact; GitHub-side protection of branch names/workflow names (no admin view).
* Windows ACLs on `small-deploy/.env` (not read, not touched), the Cloudflare audit log, and the real cost of the adopted resources.
* The harness's own run: I relied on the recorded evidence file (hash-matched to the current script), not on a rerun.

## Suggested minimal change set (one reviewed edit, then rerun the harness)

1. F1: unconditional `GO PROVISION`. 2. F2: close fd 3, single `ask()` helper with `HAVE_TTY` gate. 3. F3: refuse any non-terminal run before `load_cf`. 4. F4: hash `cli.js`, re-verify inside `wr_raw`. 5. F5: case-insensitive match, `trap -p`/alias checks, add GIT/PROXY/TLS/NODE/NPM/XDG/GH names, then allow-list.
6. F6: explicit `--config`/`--env-file` for wrangler. 7. F7: compare candidate to parent + three additions, check gate run `.path`, validate config on the release head. New harness scenarios: START-only state, inherited `3<file`, lower-case `node_options`, a `wrangler.jsonc` in an ancestor of the scratch directory, a `.env` in the scratch directory, tampered `cli.js`.
