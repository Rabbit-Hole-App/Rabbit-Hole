# Runbook: /explain generated programs in production

Order: release launcher -> read-back (inside the launcher) -> the owner's one real /explain request in the app -> receipt
-> owner browser check. One genuine production generation provides both the browser evidence and the accounting receipt;
never generate twice.

1. **Check.** `C:\s\spec\explain-sandbox\prod\explain-prod.cmd release --check`. Expect `CHECK PASSED`, the live read-back
   (today: EXPLAIN_V2_ENABLED true, no EXPLAIN_PROGRAM_ENABLED) and `would record the rollback point`.
2. **Release.** `C:\s\spec\explain-sandbox\prod\explain-prod.cmd release`. It ends with `EXPLAIN PROD release DONE` after
   the read-back (app and cp serve the candidate sha12, EXPLAIN_V2_ENABLED true, EXPLAIN_PROGRAM_ENABLED true,
   EXPLAIN_PROGRAM_EXECUTION_KILL false, no EXPLAIN_DIAGNOSTICS binding of any type) and the probes `200 200 401 401 405`.
3. **One real request (owner, signed in on digrabbithole.com).** Open a canvas, ask `/explain` the cooling question:
   "I put a cup of hot coffee in a cold room. Show me how it cools down over time, and let me change the temperature of
   the room to see how that changes things." Wait for the card. Then: the card is readable; Play visibly animates; the room
   control changes the curve; reload keeps the card; a share link opens it. Note the canvas name (from the address bar).
4. **Receipt.** NOT BUILT YET (see the hand-back): a read-only script that takes the cookie at a hidden prompt, finds that
   job on the canvas, verifies the stored result's hashes, the attached card, credits vs the reservation and no hold left,
   and books the measured credits in `C:/s/spec/budget/budget.mjs`.

## On failure

| Where | Message | Do |
|---|---|---|
| any check | `... PENDING` / `stale pin` / `not an ancestor` | Integrator fills or re-cuts the pins; rerun `--check`. Nothing was changed. |
| check | `gate ... is not success`, `no successful verify/fast-e2e run` | Get the missing evidence on that exact SHA. Never release around it. |
| check | `production serves ... not main` | Someone deployed outside a release. Stop; tell Claude. |
| `dev move failed` | rel-after-gate.sh stopped | Read the log; rerun the launcher (it resumes; dev already moved is skipped). |
| `main release failed` | the release run failed | Read the run. Its matched rollback may have restored the previous pair; rerun the launcher only after the cause is known. |
| `the read-back differs` | the Worker is not in the expected state | Rollout lag is covered by six tries 20 s apart. Otherwise choose a rollback (README.md "Which rollback when"); emergency is the fastest. |
| `probes differ` | public smoke not 200 200 401 401 405 | Emergency rollback, then tell Claude. |
| step 3 | generation fails, Play does nothing, card missing on reload | Cost/quality: `generation-off`. Card execution fault: `kill`. Anything else broken: `emergency`. |

## Isolation harness

Proof that the launcher is tested without production: `harness/run-launcher-harness.sh`, `harness/iso.cmd`, the stubs in
`harness/stubs/` and the last result `harness/harness-3.out` (80 passed, 0 failed, 2026-10-28). The private root itself (Git's
bash, coreutils and msys DLLs copied into `<root>/usr/bin`, Git's cygdrive line in `<root>/etc/fstab`, the stubs beside
them) is rebuilt in a scratch directory to rerun it. `iso.cmd` empties the Windows PATH and starts `env -i PATH=/usr/bin` bash in a private MSYS
root whose `/usr/bin` holds only coreutils and stubs (git, gh, node, curl answer from scenario files; wrangler, npx, fly,
ssh, powershell, cmd, python refuse). No real git, gh, node, curl or ssh exists in that root and no credential variable is
set. The script under test is a copy of `explain-prod.sh` that differs in exactly two lines (the state directory and the
terminal path); the harness asserts that. Every `--check` scenario asserts that no MUTATION, FORBIDDEN or UNEXPECTED call
was made and that the pins and state files are unchanged.
