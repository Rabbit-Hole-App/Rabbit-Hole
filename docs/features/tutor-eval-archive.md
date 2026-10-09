# Tutor evaluation archive

**Owner:** Home (migration, storage, routes, database readiness). Tutor eval writes `archive.mjs` (import, export, verify,
analyze) against the routes; Parallel gates and merges. Storage contract reviewed and acked by Tutor eval and Parallel,
2026-10-09.

The offline session simulator's originals (`tests/evals/tutor-session`: `run.json`, each `aggregate.json` version, one
session bundle per profile, and the run's logs) are kept byte-exact in the Learn D1. They are apart from customer
learning evidence (`learning_journeys`, 0006) and Next Steps telemetry (0012): nothing a learner's request reads or
writes touches these tables.

## Schema: `learn-migrations/0017-tutor-eval-archive.sql`

| Table | Holds |
|---|---|
| `tutor_eval_executions` | One row per run that happened once, keyed by its own minted id (`paid-20261008T180918Z-01a7a508`), never the date label. Run times, topic, mode (`real`, `scripted`, `unknown`), the run's own status, tested sha and tree, harness and config versions, Anthropic cost and calls, JEV cost (NULL when unknown, never 0), importer, artifact count, import times. |
| `tutor_eval_artifacts` | One row per original file: key (the file name; a recomputed aggregate is `aggregate@<analysis_version>.json`), kind (`manifest`, `aggregate`, `session`, `log`), content type, length, sha256, chunk count, verified time. |
| `tutor_eval_artifact_chunks` | Ordered 512 KiB chunks, each with its own sha256. |

- **Limits** (developers.cloudflare.com/d1/platform/limits, read 2026-10-09): a row or BLOB is at most 2,000,000 bytes,
  a statement at most 100 KB, at most 100 bound parameters. One chunk is far under a row; the largest real file
  (626 KB) is two chunks. An artifact is at most 50 MB through the routes; a larger run moves to R2 (Parallel).
- **Immutable:** a run is one execution. A recomputed aggregate is a new artifact, never a replacement; stored bytes
  are never overwritten.

## Import rules (`src/tutor-eval-archive.js`)

- **Declare** is resumable: the same fields again return the row (a crashed import continues); any different field is
  refused (409). Two runs on one date are two executions.
- **Put** stores whole bytes as chunks: identical bytes again are a no-op; different bytes under a key are refused
  (409), whole or by chunk. An aggregate needs its `analysis_version`; no other kind may have one.
- **Complete** re-hashes every artifact from its chunks and refuses unless exactly `artifact_count` artifacts verify.
  Until then `completed_at` stays NULL and `status()` names what is missing: an interrupted import is visibly
  incomplete, never finished.
- **Status vs completion:** `status` is the run's own outcome (`completed`, `failed`, `stopped`, `partial`, …) as the
  harness, or on a backfill the importer with a `status_note`, reported it. `completed_at` is the import's.

## Routes (`src/tutor-eval-routes.js`, owner only)

All under `/api/learn/tutor-eval/`, on the preview and production app workers:

| Route | Does |
|---|---|
| `GET executions?topic&mode&status&sha&from&to` | list, with each execution's aggregate `analysis_versions` |
| `POST executions` | declare: 201 new, 200 resumed, 409 different; `imported_by` is always the signed-in owner |
| `GET executions/:id[?kind=session]` | the row, its artifacts and the import status |
| `PUT executions/:id/artifacts/:key?kind=&analysis_version=` | whole bytes: 204, 409 different bytes, 413 over 50 MB |
| `GET executions/:id/artifacts/:key` | exact bytes, `ETag` = sha256, `Content-Disposition: attachment`, `no-store` |
| `POST executions/:id/complete` | 200 complete, 409 while anything is missing |

- **Access:** the signed-in `users.id` must equal the Worker variable `TUTOR_EVAL_OWNER_USER_ID`. Anyone else, signed in
  or not, and everyone while the variable is unset (the default), gets the same 404 as any missing page. Setting the
  variable on dev or production is an owner action. There is no bulk export route.

## Applied state

| Database | 0017 | Evidence |
|---|---|---|
| `rabbit-hole-learn-dev` | **applied 2026-10-09** (Home, standing additive-dev authorization) | file sha256 `cd213e49…` (commit `d82f072b`, blob `dd964638`); rehearsed on a live copy (applied twice, exact identity); Time Travel bookmark before: `00000076-00000000-000050ff-3c34c017940bb4344e9ed56df1cca9c2`; 61 objects after, exact identity; probe: incomplete state visible, a two-chunk artifact read back exactly, the mode CHECK and the chunk key held, probe rows deleted |
| `rabbit-hole-learn-prod` | **not applied: needs the owner's GO** | read-only rehearsal on a live copy: 54 objects, applied twice, prior objects unchanged, exact identity. The prepared run names the file sha and refuses without `--go "APPLY 0017 <sha256>"`. |

**Release order:** once 0017 is in a tree that ships, the production release preflight requires it on prod (complete
schema identity), so the owner's GO for 0017 precedes that release. 0015 (folders) and 0016 (usage) are reserved.

## Recovery

- **Data:** D1 Time Travel restores a database to a bookmark (`wrangler d1 time-travel restore <db> --bookmark <b>`).
  It is destructive and rolls back every table in that database, learners' data included, so it is an owner GO every
  time. A wrong archive import is undone instead by deleting that execution's rows (an owner action), not by restore.
- **Integrity:** every artifact can be re-verified at any time (`GET` re-hashes from chunks); a corrupted chunk is
  refused, never served.
