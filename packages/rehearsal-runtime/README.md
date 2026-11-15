# rehearsal-runtime

Runs a rehearsal job: discover the shortest documented route in a connected repository, run it in one Modal Sandbox, repair what the README got wrong inside fixed bounds, write one record and a draft plan. Spec: the Reviewer's `rehearsal-runtime-spec.md` v1.1 (§ numbers below refer to it). Runs as a local process on the owner's machine in this sprint; deployed nowhere.

## Contracts (frozen first; lanes A, B and C build against these)

| File | Contract |
|---|---|
| `schemas/job.json` | `POST /rehearsals` request (§4a) |
| `schemas/status.json` | `GET /rehearsals/<key>` (§4e) |
| `schemas/route.json` | discovered route (§4b); its description states the check rules, including `re.MULTILINE` |
| `schemas/record.json` | the record (§4c) plus `traps[]`, `modelCalls[]`, `sandboxesLeftAfter`, `imageBuildSec` |
| `schemas/plan.json` | draft plan (§4d) |
| `schemas/examples/*.example.json` | one valid example of each, for lane B and lane C |
| `fixtures/nanogpt-3adf61e/` | the Reviewer's fixture (§10); authoritative where it disagrees with spec prose |
| `limits.py` | every hard limit and the per-job `Budget` |
| `providers/base.py` | the provider interface: `start(tags) / exec / stat / fetch / stop / leftover` |

Where the fixture and the spec prose disagree the fixture wins (three traps, not two). `route.alternatives[].rejected` is the schema name; the fixture's `rejectedBecause` is matched by `compare_record.py`.

## Modal facts built in

- `timeout` and `idle_timeout` are set on every `Sandbox.create` (the default 5 min lifetime would kill the train step).
- Every sandbox is tagged `job`, `repo`, `commit`, `hardware`; the "none left" check is `Sandbox.list(app_id=..., tags={"job": key})`.
- `stop()` is `terminate(wait=True)`; the sandbox id is stored in the job state at creation so a restarted controller can terminate an orphan.
- Billing is `max(request, actual)`: `cpu=2, memory=4096` is the billed floor. Network is a TLS-only domain allowlist (`limits.OUTBOUND_DOMAIN_ALLOWLIST`, spec v1.3 §8a); `allow_domain` is a fix kind, at most 2 per job. No GPU sandbox of any kind.

## Modal budget (owner, 2026-11-14)

US$30 credit, no account cap. **Sprint stop-loss US$20 consumed on the Modal usage page**: stop all chargeable runs and report; US$10 stays for the owner's tests on 8878 and the merge-day run. Read the usage page before and after every real run and report the delta with its timestamp. Chargeable calls in order, each gated on the previous report: (1) credentials probe (one sandbox, `python -V`, terminate); (2) image build and the first nanoGPT run (build time and job time reported separately); (3) re-runs only for a named fix.

## 