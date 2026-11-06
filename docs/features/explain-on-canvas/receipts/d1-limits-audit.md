# D1 limits audit (core roadmap flow)

Base: production main `3b9348449e36fcfde1be02256d742abcc5f298a1` (roadmap ON). Scope (lead directive 2026-11-06):
`packages/control-plane/src/roadmap/` on main and `feat/tutor-r6` (2119107c0). `feat/tutor-r4-integration-2` does not exist on
rabbit-hole yet. Method: Cloudflare D1 limits page (checked 2026-11-06), a static read of every SQL string in `roadmap/`, and the
new stand-in guard (`packages/control-plane/test/d1-limits.js`) run over the whole control-plane suite (3492 tests) and over the
roadmap and settings suites on the R6 tip. No database was touched: every limit here is a property of the SQL and its bound
values, which the guard evaluates exactly, so no dev D1 query was needed.

D1 limits used (docs): LIKE/GLOB pattern 50 bytes; 100 bound parameters per query; 100 KB per statement (each statement of a
batch); 2 MB per string/BLOB/row; 32 arguments per SQL function; 1000 queries per invocation (a `db.batch` counts as one);
50 MB per result (enforced from 2026-11-04); `BEGIN`/`COMMIT` not accepted, `db.batch` is the atomic unit.

## Findings, ranked by production reachability

| # | Where | SQL and limit | Reachable | Failing scenario | Minimal fix |
|---|---|---|---|---|---|
| 1 | `roadmap/roadmap-models.js:35` (`platformCallModel`) and `:93` (`platformJevAsk`) | `SELECT checkpoint FROM learn_roadmap_calls WHERE operation_key LIKE ?` bound to `rm.<roadmapId>.<version>.<anchor>.<stage>.<call>.%`. Pattern is 70 to 71 bytes (ids are prefix plus 24 hex), limit 50 | LIVE NOW: every planning, proposal, generation, grounding and safety model call of the core flow runs this before the provider call, so with ROADMAP_ENABLED on each throws "LIKE or GLOB pattern too complex" | Learner presses Start roadmap: the first model call fails, nothing is planned or generated | Hotfix owns it (pin 71). Replace LIKE by a range: `operation_key >= ?1 AND operation_key < ?2` with the prefix and prefix plus `￿`, or `substr(operation_key, 1, ?) = ?`. The guard fails 4 tests on the old code |
| 2 | `canvases.js:138` `freeTitle`, reached from `learn-boards.js:611` (fork, duplicate, copy a canvas) | `c.title LIKE ? ESCAPE` bound to the escaped title plus ` (%)`. Title up to 120 chars, so the pattern is up to about 245 bytes; fails for a title over about 46 bytes | LIVE NOW, not roadmap | Fork a canvas titled "Introduction to reinforcement learning with policy gradients" and the request 500s. `canvas-forking.test.js` ("a fork takes the typed name...") fails under the guard | Replace the LIKE by `substr(c.title, 1, ?) = ?` on `base + ' ('` (the code already filters into a `taken` set in JS), or LIKE on a 40-byte prefix and filter in JS |
| 3 | `likeOf` and `searchTerm` (`learn-boards.js:992-993`), used by Explore (`learn-boards.js:1005,1015`), `creators.js:41,68,84-89`, `canvas-stars-list.js:49` | `LIKE ?` bound to `%term%`, term capped at 60 chars, so the pattern is up to 62 bytes plus escapes; fails for a term over 48 bytes (fewer for non-ASCII) | LIVE NOW, not roadmap, follow-up | Pasting a long phrase into Explore, creators or Stars search 500s | Cap `searchTerm` at 48 bytes (by bytes, not chars), or `instr(lower(col), ?) > 0` |
| 4 | `canvas-refs.js:88-91` | `c.title LIKE ?`, term capped at 100 chars | LIVE NOW, not roadmap, follow-up | Same, in the canvas reference picker | Same as 3 |
| 5 | `canvas-comments.js:415` | `h.email IN (<every audience member>)` plus 2 LIKE binds. Public audience is every distinct commenter of the canvas's public threads, unbounded | Rare: a public canvas with 99 or more distinct commenters | Mention autocomplete there throws "too many SQL variables" | Chunk the set by 90, or filter in SQL |
| 6 | `roadmap/roadmap-source-read.js:45` `d1PublicRefs` | `id IN (?, ...)` plus 3 binds; the list is the roadmap's distinct source refs, one per step, steps capped at 5/10/15 by depth | Not reachable today (needs 98 or more ids) | None | Chunk by 90 if the step ceiling ever grows past 90 |
| 7 | `roadmap/roadmap-money.js:43`, `roadmap-planning.js:90` | `IN (<states before the target>)`, a fixed set of at most 8 states | Not reachable | None | None |

Checked and clean in the roadmap code (main and R6):

- Bound parameters: the widest statement is an `INSERT ... SELECT` with 14 to 16 binds; the guard found none over 100.
- Statement length: no SQL is built from user data except placeholder lists; the large values are bound, not inlined
  (instruction 1000 chars, passage 8000 chars, plan JSON bounded by `maxTokens`). No bound value is near 2 MB.
- Function arguments (limit 32): `roadmap/` uses no `json_*` or other variadic function with a data-dependent argument count.
- Transactions: no `BEGIN`, `COMMIT`, `SAVEPOINT` or `PRAGMA` in `roadmap/` or in migrations 0036 to 0040. Atomic work is
  `db.batch` (`roadmap-store.js:75`, `roadmap-events.js:34`, `roadmap-money.js:119`); the receipt-guarded `EXISTS` pattern is valid
  inside a D1 batch. R6 batches are `[save, ...fact statements]` and a fan-out of at most `FANOUT_PAGE` inserts; a batch of any size
  counts as one query.
- Queries per invocation (1000 on Paid): roadmap handlers issue a handful per request; `sweepUndelivered` is limited to 20 rows.
- `RETURNING`, `last_row_id`, `WITH RECURSIVE`, `ATTACH`, `REGEXP`, `PRAGMA`: none in `roadmap/`. `meta.changes` is read per statement
  from `db.batch` results (`roadmap-money.js:131`), which D1 returns per statement.
- Error-text coupling: `/UNIQUE/i` on `error.message` (`roadmap-store.js:81`) and `/no such table/i` (`roadmap-source-read.js:20`,
  `roadmap-source-refs.js:13`) match D1's wording (`D1_ERROR: UNIQUE constraint failed ...`, `no such table: ...`).
- Result size (50 MB, enforced since 2026-11-04): every roadmap read is by key or `LIMIT` 1 to 20.
- Partial/unique index and foreign key semantics follow the same engine rules as node:sqlite; no `defer_foreign_keys` dependence found.
- R6 (`feat/tutor-r6`): the roadmap and settings suites with the guard on show only finding 1.

## What the node:sqlite tests cannot see

`node:sqlite` has no 50-byte LIKE limit, allows 32766 variables, about 1 MB statements and no row limit. The shared stand-in also
returns `lastInsertRowid`, not D1's `last_row_id`, so code that reads `meta.last_row_id` (`ask.js:453`, `index.js:367,1250`) cannot
be tested on it (follow-up, not core flow).

## Guard

`packages/control-plane/test/d1-limits.js` `checkD1Limits(sql, args)` fails on a LIKE/GLOB pattern (bound `?` or `?N`, or a literal)
over 50 bytes, more than 100 bound parameters, a statement over 100 KB and a bound string or BLOB over 2 MB. It is called from `bind`
in the shared `learnDb` stand-in (`test/learn-grade-fixture.js`, used by 45 test files including the roadmap fixture). Test:
`test/d1-limits.test.js`. Not covered (marked `ponytail:` in the helper): a pattern built inside the SQL (`'%' || ? || '%'`) and the
32-argument function limit. About 40 other test files use their own ad hoc `prepare` stand-ins that do not call the guard (follow-up).

Run over main the guard fails exactly 5 tests: the four `roadmap-models` tests of finding 1 and the `canvas-forking.test.js` test
"a fork takes the typed name" for finding 2. Merge order: the hotfix for finding 1 and a `freeTitle` fix first, then this branch.

## Follow-ups (outside the lead's scope, not audited)

R5, R7a, R7b, R8b and R9 branches; non-roadmap code beyond the greps behind findings 2 to 5 (card feedback, user settings, source
refs, attempt stores, canvas members, comments and publications, animation and explain jobs); the ad hoc D1 stand-ins;
`json_object` argument counts in non-roadmap SQL; `feat/tutor-r4-integration-2` once pushed.
