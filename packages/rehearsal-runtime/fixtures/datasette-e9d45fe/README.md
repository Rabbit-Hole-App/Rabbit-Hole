# Fixture — simonw/datasette at e9d45fe (CPU) — the second fixture: a CLI + a web server + a test suite

Written by the Reviewer 2026-11-14 19:00 PT from a clone whose `git rev-parse HEAD` is `e9d45fe400608d516d7b2b676f678ee4461579e1` (master tip 2026-11-14, "Fix for clumsy 'All 1 query' text"; 385 tracked files). Destination: `packages/rehearsal-runtime/fixtures/datasette-e9d45fe/`. Acceptance for `route-catalogue-spec.md` §9; nanoGPT stays the one-route regression.

Why this repository: pure Python (no Docker, GPU, downloads or accounts), yet it is three things at once — a `click` CLI (`datasette inspect`, `--get`), a web server (`datasette serve`, port 8001, JSON API) and a 1,687-function `pytest` suite — so the catalogue must find several routes, the chat must ask, and the runner must exercise `port_listens`, `http_200`, `tests_passed` and a long-running step. It is one package, not a monorepo; a multi-package fixture (e.g. `tiangolo/full-stack-fastapi-template`) is the third fixture, after the Docker question in §6 is answered.

| File | Asserts | Against |
|---|---|---|
| `expected-catalogue.json` | the routes the catalogue must find (A serve, B ask/inspect, C tests), the impractical ones with reasons, summary words, chat wording rules | the catalogue + the rendered choice message |
| `expected-route-serve.json` | route A as rehearsed: install from the checkout, fixtures.db written, serve started in the background, probed, stopped; knobs | `record` for route A |
| `expected-route-tests.json` | route C: dev deps installed, pytest run, ≥ 1500 passed, failures listed | `record` for route C |
| `expected-traps.json` | three commands that must fail (click IntRange, fixtures.py refusals) | `record.traps` |
| `expected-files.json` | fixtures.db exists; stdout fragments; `/-/versions.json` body | `record.steps[*]`, logs |

## Things the catalogue has to get right here (each is a real generalisation step beyond nanoGPT)
1. **Install from the checkout, not PyPI.** README.md:37 says `pip install datasette`; at a pinned commit the only honest install is `pip install -e .` (pyproject.toml:55-56 defines the `datasette` script).
2. **No sample data in the repo.** `datasette serve` needs a `.db`; the catalogue must find `python tests/fixtures.py fixtures.db` (docs/contributing.rst:146) or use `--memory` (cli.py:418). A route that serves a file that does not exist is a defect.
3. **`uv run` everywhere in the docs; no `uv` in the sandbox.** Either drop the prefix (edit_command) or `pip install uv` (install_package). Both allowed; record which.
4. **A long-running step.** `datasette serve` never exits; the runner must start it in the background, probe `port_listens` + `http_200`, record `startedSec`, and stop it. Default port 8001 (cli.py:376).
5. **Dependency groups.** The test route needs the `dev` group (pyproject.toml:61-73): `pip install --group dev` on pip ≥ 25.1, else the explicit list.
6. **Impractical routes stay visible as text:** publish (accounts), package (Docker), Playwright (browsers), brew (macOS) — never chips.

## Matching rules
Route ids are model-chosen and not matched; a route is matched by its `stepsSketch[*].source` set. Commands compare after whitespace collapse; `uv run` prefix and `--port` values are free. Titles/descriptions must contain no command, path or `file:line`. Exactly one ⭐, on A or B. Timing is recorded, never judged except by the step timeout. `failed > 0` in the test route is a finding, not a fixture failure.

## Unknown until the run (record them, then tighten)
fixtures.db size · test-suite wall time and pass/fail counts on 2 CPUs · whether `pip install --group dev` works in the image's pip · the exact body of `/-/versions.json`.
