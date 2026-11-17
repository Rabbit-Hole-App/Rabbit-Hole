# Rehearsal evidence, 2026-11-15

Every run below was driven through the real stack on the owner's local app (8878: control plane, controller on 8891,
local indexer on 8892) against real Modal sandboxes and the real model (`claude-sonnet-5-5`). Nothing is mocked.
Records are the stored R2 objects (`rehearsal-<route>-cpu.json`), logs come from each run's `artifacts.zip` (the zips
themselves, about 10 MB each for nanoGPT because of the checkpoint, are not committed). The score files in
`compare/` are the output of `packages/rehearsal-runtime/compare_record.py` on the records, with `--relax` (step ids
are mapped by command, route ids are model-chosen) and `--logs` where the logs exist. Earlier runs (2026-11-14) are in
`../2026-11-14/`.

Modal: no measured cost. `modal.billing.workspace_billing_report` answers but returns no items, so no dollar figure is
quoted. `Sandbox.list` for the app was empty after every stage.

## Catalogues (`catalogues/`)

| Repository | Run | Routes | Practical | Practical routes |
|---|---|---|---|---|
| nanoGPT (3adf61e) | 1 | 6 | 1 | cpu_shakespeare_char |
| nanoGPT | 2 | 6 | 3 | shakespeare_char_cpu, sample_pretrained_gpt2, benchmark_speed |
| nanoGPT | 3 | 6 | 3 | shakespeare_char_cpu, sample_pretrained_gpt2, benchmark_cpu |
| datasette (b98e1a2e) | 1 | 9 | 5 | get_json_cli, browse_fixtures_web, run_tests, create_token, list_plugins |
| datasette | 2 | 9 | 6 | the same plus inspect_database (serve route named serve_fixtures_web) |

The practical count varies from run to run on the same commit (nanoGPT 1 to 3, datasette 5 to 6): the model decides
what is practical, and `sample_pretrained_gpt2` is listed practical although it would need a Hugging Face download
the sandbox blocks. Route ids are model-chosen and differ between runs. Datasette imports the branch head (b98e1a2e),
not the fixture's commit e9d45fe (both are 1.0a42), so line-number citations in the fixture drift.

## nanoGPT route runs (`nanogpt-*`)

| Record | Route | Result | Score (compare_record --relax --logs) |
|---|---|---|---|
| `nanogpt-route-record2` | cpu_shakespeare_char | ready, 145 s (prepare 0.8 s, train 86.6 s, sample 13.0 s) | 47 PASS, 7 FAIL |
| `nanogpt-rerun1` | shakespeare_char_cpu | ready (prepare 1.2 s, train 97.4 s, sample 14.4 s) | 49 PASS, 1 FAIL |
| `nanogpt-rerun2` | shakespeare_char_cpu | ready, 180 s (prepare 3.0 s, train 113.8 s, sample 12.8 s) | 56 PASS, 0 FAIL |

`nanogpt-rerun2` is the named re-run ("`--start` now listed"): the knob list, the `--start` value line and the
knob-verification lines all pass, and the temperature rule is the owner's "differs from the default" rule
(`temperatureDiffersFrom`, either direction). Its one SKIPPED line is the route alternatives, which live in the
catalogue.

What the earlier two runs show, and why the runner changed:

- `route-record2`: the model did not list `--start`, so the knob line, the `--start` verification and
  `startsWithPrompt` failed; its traps used `--temperature=1` and `--temprature=1.0` instead of the fixture's
  commands (a fixture-versus-design question: traps are model-chosen).
- `rerun1`: discovery now lists every knob the script declares. Verification then tried string knobs with invented
  values, `--init_from=hello`, which crashes `sample.py` (`NameError: name 'model' is not defined`). Both commands are
  in `record.knobsFailed` (cmd, rc, one-line error) instead of being dropped, and `knobsVerified` is empty (the one
  FAIL). The runner now verifies a string knob only when it has a safe value or is prompt-like (`--start`, `--prompt`,
  and so on); `rerun2` shows the result.

## datasette route runs (`datasette-*`)

| Record | Route | Result | Score |
|---|---|---|---|
| `datasette-serve-first-gaveup` | browse_fixtures_web | gave up at `serve` (60.5 s): the http_200 probe failed; the sandbox image had no `curl` | 20 PASS, 13 FAIL |
| `datasette-serve` | serve_fixtures_web | ready 66.6 s; serve starts in 2.9 s, probes passed (`/`, `/fixtures.json`) | 28 PASS, 6 FAIL |
| `datasette-tests` | run_tests | 3,164 passed in 41 s (parallel), plus 41 serial in 6.9 s | 20 PASS, 2 FAIL |

The first serve run is the reason `curl` was added to the sandbox base image; it is kept as evidence that a probe
failure ends in a recorded give-up with the model's reason, not a hang. The tests route adds `pip install pip==25.3`
as a repair step (a pip upgrade, accepted by the fixture and shown as INFO).

Remaining FAILs (`compare/datasette-*.txt`), each judged in the score file's context:

- commit differs from the fixture (all runs): the import takes the branch head.
- install source: the records cite `docs/contributing.rst:46`, where the `--group dev` install is documented; the
  fixture's source list is too narrow.
- serve route: the fixtures command carries extra CI arguments; the serve command is `datasette fixtures.db` without
  `serve`; `knobsVerified` is empty because verification of a long-running server's knobs is not implemented
  (`knobsFailed` is empty too); the model's traps differ from the fixture's three.
- catalogue: `publish_cloud` does not mention an account in run 1; run 2 omits the Playwright browser tests.

Known limits: `stdoutKind` classifies uvicorn log lines as a table; the probed paths did not include
`/-/versions.json`, so two body fragments are SKIPPED.

## Product changes outside the feature (for the merge report)

- Removed the "In <project> →" row above a canvas (`CanvasPage.jsx`) and updated two spots in
  `e2e/rabbit-hole-check.mjs`.
- A flagged Start (`VITE_REHEARSAL_TRIGGER=1`, dev builds only) opens a canvas inside the project.
- `scripts/ci/check-map.json`: the rehearsal files are classified (runtime as `none`; web files as recorded coverage
  holes), plus the new `doc-card-check.mjs`.

## Not covered

No browser check was run by Claude. The Document-card check (`packages/web/e2e/doc-card-check.mjs`) is written, not
run. Modal cost is unmeasured.
