# Rehearsal runtime: evidence, 2026-11-14

Branch `rehearsal/mvp` (candidate SHA in the commit that adds this file). Fixture: `packages/rehearsal-runtime/fixtures/nanogpt-3adf61e/`. Provider: Modal, one sandbox per job, TLS-only domain allowlist, `Sandbox.list` empty after every run.

## A1, credentials probe (`probe.txt`)
Sandbox `sb-01M7E9N8VKEW2EKE9YT55DW0T9`, Python 3.12.16, torch 2.15.0+cpu, 0 nvidia/cuda/triton packages, tags read back, pypi.org reachable (200), example.com blocked (connection reset), `terminated: true`, `leftover: []`. Image build 79.8 s, lifetime 84.5 s. Modal profile `default`, default environment.

## A2, nanoGPT 3adf61e, cpu
| | run1 (`run1/record.json`) | run2 (`run2/`, after the knob-verification fixes) |
|---|---|---|
| status / allChecksPassed | ready / true | ready / true |
| wallSec (image cached) | 202.2 | 143.9 |
| train loss first / last | 4.1676 / 1.7648 | 4.1828 / 1.6958 |
| fixes | none (requests, tiktoken arrived through the trimmed install step) | none |
| modelSpendUsd | 0.111 | 0.103 |
| sandbox | sb-01M7E9QHZV7VTAAEDRGHZF3690, terminated, list empty | sb-01M7EA4QKZ9GJRCBB594NB2HR7, terminated, list empty |
| compare_record.py (strict) | 21 PASS, 21 FAIL, 4 SKIPPED | `compare-run2.txt` |
| compare_record.py --relax | 48 PASS, 7 FAIL | 50 PASS, 5 FAIL (`compare-run2-relax.txt`) |

The rerun was for one named fix set: knobsVerified[0] was a failing `train.py` command with duplicated flags in run1; it is now one combined `sample.py` command (rc 0). Also fixed: memGiB (host 1024 reported), a warnings pattern that matched generated text, duplicate trap ids.

## Remaining FAIL lines under `--relax`, with causes (for the Reviewer to accept or change)
1. `route.alternatives` (2 lines): discovery named its rejected routes `shakespeare_char_gpu`, `openwebtext_gpt2_repro`, `gpt2_eval_baselines`; the fixture expects the ids `reproduce_gpt2` and `finetune_gpt2`. The reasons recorded are correct; the ids are model-chosen.
2. `knobVerification cmd` and `separators`: the run used `--start=hello --num_samples=2`; the fixture's command uses `--start=ROMEO: --num_samples=1` (the route carries no `safeValue` for `--start`, so the runner's type default `hello` was used) and expects 1 separator, the run printed 2. `rc 0` and `startsWithPrompt` pass.
3. `files bytesMin`: `meta.pkl` is 703 bytes, the fixture's minimum is 1000. A 65-character vocabulary pickles small; the bound looks too high (suggest 500).

## Not measured
Modal cost: `modal.billing.workspace_billing_report` is permitted for this workspace but returned zero items (hourly buckets lag) when read after each run. No figure is claimed. Strict (no `--relax`) comparison fails mainly because discovery names routes and steps itself (`shakespeare_char_cpu`, `prepare_data`, `train_cpu`, `sample_cpu`); `--relax` maps them by command and prints each mapping as INFO.
