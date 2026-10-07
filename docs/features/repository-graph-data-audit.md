# Repository graph data audit

Task #67, audit only (owner, 2026-10-06, policy lane 3). The question: which canonical Code, Decision, Question and
Session nodes and edges exist today for the repository Graph. No code, schema or migration was changed.

- **Read:** `repository-schema.sql` (the LEARN_DB mirror), `schema.sql` and `migrations/` (env.DB), `learn-migrations/`,
  `packages/control-plane/src`, `packages/web/src`, `packages/lesson-renderer` and `docs/features`, at `f63319b2`.
- **Not read:** no running database. Every claim cites the file and line, or the table and column, it comes from.
- **Owner's rules applied:** Code, Decisions, Questions and Sessions are first-class node types; only canonical edges
  render; timestamps are kept for a future history view; relationships are never invented
  (repo-graph-clarification, 2026-10-06).

## Short answer

- **No Decision, Question or Session record is stored anywhere.** No table, column or server route holds one.
  - The only records with those names are made-up preview fixtures for `karpathy/nanoGPT` in the web bundle
    (`packages/web/src/home/map-memory-data.js:1-6`). They load only on review builds with `?fixtures=1`.
  - The server says the same thing to the model: "No decision, question or session records are captured for this
    project, so there is no recorded history" (`control-plane/src/agents/learn-chat.js:53`).
- **Code is canonical.** Files, symbols and Code→Code edges come from a per-commit Graphify snapshot.
- **The nearest real knowledge records are repository chats.** `threads` are pinned to a commit, and their `messages`
  hold the learner's questions and the answers.
- **Of the seven edges the owner listed:**
  - only Code→Code is canonical;
  - Session→Question is canonical only if a chat thread counts as a Session;
  - Question→Code can be derived only for line-range selections;
  - the rest have no data.

## 1. Node types

| Node type | Canonical record exists? | Timestamps | Links to code | Source |
|---|---|---|---|---|
| Code: file | Yes, one set per indexed commit | None on the file; `repository_versions.created_at` is when the snapshot was stored | Is code; path is the key | R2 snapshot `files` map (`lesson-renderer/index_repository.py:87`), key in `repository_versions.storage_key` (`repositories.js:116-118`) |
| Code: symbol / external | Yes, one set per indexed commit | None | `path` and start `line` only; no end line, no range | `snapshot.graph.nodes` `{id,label,path,line,kind}` (`index_repository.py:73-84`) |
| Decision | **No.** Fixture only | Fixture `at` date string (`map-memory-data.js:21-26`) | Fixture `code[].id` and `evidence[].path/line` | `home/map-memory-data.js:20-27` |
| Question | **No record.** Nearest: LEARN_DB `messages` with `role='user'` in repository chats | **None on the message** (`repository-schema.sql:14-16`); the thread's `created_at` | Thread `commit_sha`; a selected line range only as text appended to the message; a selected node is not stored | `repository-schema.sql:10-16`, `repositories.js:231,249-250`, `canvas-conversation.js:24` |
| Question (fixture) | Fixture only | **None** (no `at` field) | Fixture `code[].id` | `map-memory-data.js:29-36` |
| Session | **No record.** Nearest: LEARN_DB `threads` (one repository chat) | `created_at` only; no `updated_at` | `commit_sha` (pinned) and `scope_ref` (project name) | `repository-schema.sql:10-13`, `repositories.js:248-249` |
| Session (fixture) | Fixture only | Fixture `at` date string | Fixture `code[].id` ("code touched") | `map-memory-data.js:13-18` |

## 2. Edges

Classification: **CANONICAL** means stored explicitly. **DERIVABLE** means it can be computed deterministically from
stored data. A derivation is not a stored edge: nobody recorded it, and it is only as good as its rule.
**UNAVAILABLE** means there is no data.

| Edge (owner's list) | Class | Where, or how | Notes |
|---|---|---|---|
| Session → produced/discussed → Decision | **UNAVAILABLE** | No Decision records exist. | Fixture field `decision.session` (`map-memory-data.js:21-26`) only. |
| Session → raised → Question | **CANONICAL only if a chat thread is a Session**; otherwise UNAVAILABLE | `messages.thread_id` → `threads.id` (`repository-schema.sql:15`), written by `threadTurns` (`canvas-conversation.js:24`). | Per user and private: `repositories.js:196-197` filters on `org`, `user` and `scope_ref`. Fixture field `question.session`. See Open question A. |
| Decision → changed/affected → Code | **UNAVAILABLE** | No Decision records exist. | Fixture `decision.code[]` (RECORDED or INFERRED with a score) and `decision.evidence[]` (path, line). |
| Question → concerns → Code | **DERIVABLE for line ranges only**; UNAVAILABLE for selected nodes | A range question is stored with a server-written suffix, `Selected code: <path>:<start>-<end> (commit <sha>)` (`repositories.js:231`, stored at `:250`). Parsing that suffix is deterministic. A learner could type the same words, so only the final suffix line counts. | A selected node (`repository_context.nodeId`, sent by `agent/ask-stream.js:13` and `ask.jsx:624`) only shapes the answer (`repositories.js:215`). It is never stored. |
| Question → led_to → Decision | **UNAVAILABLE** | No Decision records exist. | No fixture field either. |
| Decision → implemented_by → PR / commit / code | **UNAVAILABLE** | No Decision records, no PR data anywhere, no commit history. | The indexer reads branch heads with `git ls-remote` (`repository_jobs.py:43`) and a zip at one commit (`index_repository.py:59`). |
| Code → related_to → Code | **CANONICAL** | `snapshot.graph.edges` `{source,target,relation,confidence,context}` (`index_repository.py:79-85`). There is one immutable snapshot per `(app_id, commit_sha)`, in `repository_versions` and R2. | Extracted by Graphify, not recorded by a person. `confidence` separates EXTRACTED (solid) from everything else (dashed) (`RepositoryGraph.jsx:137`). External dependencies become `kind:'external'` nodes (`index_repository.py:81-84`). |

### Canonical links already stored, outside the owner's list

The graph could use these, but none of them is a Decision, Question or Session edge.

| Link | Stored in | Pinned to a revision? |
|---|---|---|
| Answer (assistant message) → graph view of code nodes and edges | `repository_message_graphs.graph_json` `{id, commit, kind, title, nodes[{…, commit}], edges}` (`repositories.js:225-227,252`) | Yes, the thread's commit. It holds the answer's last graph-tool result only. |
| Chat thread → commit | `threads.commit_sha` (`repositories.js:212,249`); a selection from another commit is refused (`:213`) | Yes |
| Repository project → indexed commits | `repository_versions (app_id, commit_sha, storage_key, created_at)` | Yes, one row per commit |
| Repository project → current head | `repository_apps.commit_sha` (`repositories.js:92,119`) | No: it moves on refresh |
| Canvas → repository project | `canvases.project` = `repository_apps.name` (`canvases.js:155`) | No |
| Shared or forked board → repository at a commit | `board_repository_pins (board_id, repository_id, commit_sha, pinned_at)` (`learn-shared-ask.js:49-58`, `learn-boards.js:318`) | Yes |
| Course → commit it was generated from | `learn_courses.source_version` = `app.commit_sha` (`repositories.js:175-178`, `learn-course.js:117-118`) | Yes |
| Teaching card → code range | `block.sources[]` of kind `code`: `{repo, revision (40 hex), path, lines:[start,end]}` (`card-sources.js:29-35`). Authored nanoGPT cards set it (`nanogpt/sources.js:10`). | Yes. It lives in board state (`learn_boards.state_json`) or the browser. |
| Rabbit Hole → parent canvas and card | `canvas_dives (parent_app, parent_board, origin_block_id, dive_json, created_at)` (`dives.js:90-100`) | Not a code link |

## 3. Details

### 3.1 Decision records (question 1)

**Nothing on the server.** No `decision*` table, column or id exists in `schema.sql`, `migrations/`, `learn-migrations/`
or `repository-schema.sql`, and no route reads or writes one. The repository prompt tells the model to say "I don't have
a recorded project decision explaining why the team chose this" (`agents/learn-chat.js:53`).

**Map fixtures** are the only Decision-shaped data the Map reads.
- **Shape** (`home/map-memory-data.js:20-27`): `{id, title, rationale, alternatives[], who, agent, session, at, evidence[{path,line,note}], code[{id, confidence, score?}], visibility, owner, fixture:true}`.
- **Loaded** by `useMapMemory` (`home/review-fixtures.js:34-40`), and only under all of these:
  - a review build (`reviewTools`, `flags.js:7`, which needs `VITE_COACHING_DEV=true`);
  - `?fixtures=1` (`fixturesOn`, `review-fixtures.js:12-20`);
  - the repository `karpathy/nanoGPT` (`map-memory-data.js:39`).
- **Excluded** from production bundles (`e2e/production-bundle-check.mjs:10`).
- **Read** by `layerGraph`, `memoryFor` and `fixtureAnswer` (`map-memory.js:23-86`), and by `MemorySections` and
  `MemoryEntity` (`MapMemory.jsx:32-79`).
- **Never sent** to the model or any API (`map-memory.js:1-4`, `RepositoryPage.jsx:70-71`).
- **Status:** the Knowledge Capture v1 backend is deferred (`docs/features/rabbit-hole-checklist.md:205-207,330-332`).

**Other decision-shaped data that is not product data:**
- **Coaching samples** (`coaching/sample-data.js:1,46`): synthetic decisions for the Agent tab of Small deploy apps
  (`SharePage.jsx:839`), not repository projects.
- **Coaching evaluation corpus** (`tests/evals/coaching/corpus.json:13-25`): offline benchmark data about this repo. Each
  `cases[].gold[]` has `decision`, `reason`, `evidence` (message ids), `alternatives` and
  `anchor {path, start_line, end_line}`, under a case `commit`. The product never reads it
  (`docs/features/coaching-benchmark.md:84-88`). It is useful prior art for a record's shape (§4).

**Records named "decision" that are not project decisions:**

| Record | Meaning | Stored | Code link |
|---|---|---|---|
| Tutor action-validation `decisions` (`web/src/learn-tutor.js:409-410,425,466`) | Which planned Tutor actions were accepted or rejected in one turn | Browser memory and the bench record. Nothing is stored server-side for a nanoGPT canvas (`learn-tutor-routes.js:6`). | No |
| `learning_path_versions` (`repository-schema.sql:231-235`; writer `learn-journey-store.js:120-137`) | Why a learning path changed: `source`, `reason`, `evidence_refs`, `changes_json` | LEARN_DB, `created_at` | No: journeys are always grounded as `{kind:'topic'}` (`learn-journey.js:195`) |
| `learn_courses.approved_revision` (`repository-schema.sql:22-26`) | The owner approved a curriculum | LEARN_DB, `updated_at` | Commit only (`source_version`) |
| `proposals` (`schema.sql:140-151`) | Tool-call approval log for Small app Ask | env.DB, `created_at`, `approved_at` | No: Small apps, not repositories |

### 3.2 Question records (question 2)

| Candidate | Stored where | Writer → reader | Timestamps | Code link |
|---|---|---|---|---|
| Repository chat user message | LEARN_DB `messages` with `role='user'` and thread id `repochat-*` (`repository-schema.sql:14-16`) | `repositoryAsk` (`repositories.js:202-254`) → `threadTurns` (`canvas-conversation.js:24`). It is reached from Learn chat (`ask.jsx:624`) and from the Map's Agent Bar: `/api/learn/ask` with `scope.app` `repo-*` (`agent/scope.js:19-21` → `web/dev-worker.js:159-161`). Read by `GET /api/repositories/<name>/threads/<id>` (`repositories.js:200`). | None on the message; thread `created_at` | Thread commit; a range only as the text suffix; a node never |
| Canvas chat user message | Same tables, thread id `canvaschat-*` with `commit_sha` `''` (`canvases.js:239-250`) | `apiAsk` with the canvas seam (`index.js:1141-1156`) | As above | None |
| Canvas exchange (question card on the board) | Browser `localStorage` `<canvas>:chat` (`LearnPage.jsx:216-223`). Shape: `{id, question, linkFrom, answer, status, dx, dy, replies}` (`LearnPage.jsx:519,532`) | Browser only | None | None |
| Tutor's open question | Browser `sessionStorage` Tutor store, field `open` (`learn-tutor.js:441-443`; `LearnTutor.jsx:30,57`) | Browser tab only | None | None |
| Question that opened a Rabbit Hole | `canvas_dives.dive_json.return_point.pending_question` (`web/src/dive.js:113-116`, stored at `dives.js:90-100`) | `POST /api/canvases/dives` | `canvas_dives.created_at` | None: its origin is a card or block |
| Video-moment question | `learn_moments.question` (`schema.sql:234-246`), written at `ask.js:416` through `learnMomentsDb` (LEARN_DB when bound, `learn-storage.js:18`) | Tutor `show_video` | `created_at` | None: a video id and time range |
| Shared-canvas ask | `shared_ask_events`, which by design holds no question text (`repository-schema.sql:185-198`) | `learn-shared-ask.js:147` | `asked_at` (epoch seconds) | `repository` 0/1 only |

These are questions the system asks, so they are not candidates: practice prompts (`learn_grades.prompt`,
`repository-schema.sql:37-64`) and journey diagnostic probes (`learning_journeys.diagnostic_json`).

### 3.3 Session records (question 3)

| Candidate | Stored where | Timestamps | Code link |
|---|---|---|---|
| Repository chat | LEARN_DB `threads` `{id, org, user, scope_ref, commit_sha, title}`; the title is the first 120 characters of the first question, or a rename (`repositories.js:199,249`) | `created_at`; renames are not timed | `commit_sha` (pinned), `scope_ref` (project) |
| Canvas chat | `threads` with `canvaschat-*` (`canvases.js:247`) | `created_at` | None (`commit_sha` `''`) |
| Learning journey | `learning_journeys` scoped to `(org, owner_user_id, app, board)`, plus `learning_path_versions` (`repository-schema.sql:217-235`) | `created_at`, `updated_at`, `archived_at` as JavaScript ISO strings (`learn-journey-store.js:49,100,109`); `revision` counter | None: `grounding_json` is always `{kind:'topic'}` (`learn-journey.js:195`) |
| Tutor session | Browser `sessionStorage` (`LearnTutor.jsx:27-30,57`). A journey's evidence events are on the server, ordered by `seq` with no wall-clock time (`learn-tutor-evidence.js:35-39`). | None | None |
| Canvas / Rabbit Hole | `canvases`, `canvas_dives`, `learn_boards`, `canvas_metadata` | `created_at`, `archived_at`; `canvas_dives.created_at`; `learn_boards.updated_at` and `version`; `canvas_metadata.updated_at` | Only `canvases.project`, and `board_repository_pins` |
| Work session, as in the owner's example (person + agent + summary + code touched) | **None.** Fixture only (`map-memory-data.js:13-18`); Coaching samples `type:'Session'` (`coaching/sample-data.js:59-60`) are synthetic | Fixture `at` | Fixture only |

No table across `schema.sql`, `migrations/` and `learn-migrations/` records a learning or work session.

### 3.4 Timestamps (question 4)

| Field | Meaning |
|---|---|
| `repository_apps.created_at` | When the repository was imported. There is no `updated_at`; `commit_sha` is overwritten on refresh. |
| `repository_versions.created_at` | When that commit's snapshot was first stored (`INSERT OR IGNORE`, `repositories.js:118`). This is **not** the commit's author or commit date, which nothing stores. |
| `threads.created_at` (LEARN_DB) | When the chat started. There is no `updated_at` or last-turn time. |
| `messages` (LEARN_DB) | **No timestamp column** (`repository-schema.sql:14-16`); order is `id` only. The env.DB `messages` table has `created_at` (`schema.sql:130-136`), but that table is Small app Ask. |
| `repository_message_graphs` | No timestamp. |
| `learn_courses.updated_at` | The last course write. There is no `created_at`. |
| `canvases.created_at` / `archived_at`, `canvas_metadata.updated_at` | Created; archived; last meaningful change (`repository-schema.sql:267-281`). |
| `learn_boards.updated_at`, `version` | The last board save. |
| `canvas_dives.created_at`, `canvas_forks.forked_at`, `board_repository_pins.pinned_at` | When the hole was made, the fork was made, the share was pinned. |
| `learning_journeys.created_at` / `updated_at` / `archived_at`, `learning_path_versions.created_at` | Journey lifecycle; when each path version was written. |
| `learn_moments.created_at`, `shared_ask_events.asked_at` | When the moment was shown; when the shared ask was admitted. |
| Fixtures `at` | A `YYYY-MM-DD` string on sessions and decisions; questions have none. |
| Snapshot nodes and edges | None: the snapshot's commit is their version. |

There are two formats. SQLite `datetime('now')` writes `YYYY-MM-DD HH:MM:SS` in UTC; JavaScript writes ISO 8601
(`learn-journey-store.js:49`, `learn-shared-ask.js:56`). A history view must normalise them.

### 3.5 Links to commits, files, symbols and PRs (question 5)

| Record | Commit | File | Symbol | Range | PR | Pinned? |
|---|---|---|---|---|---|---|
| Snapshot node | The snapshot's `commit` | `path` (null for external) | `id`, `label` | Start `line` only | — | Yes, per snapshot |
| Snapshot edge | The snapshot's `commit` | — | `source`, `target` node ids | — | — | Yes |
| `threads` | `commit_sha` | — | — | — | — | Yes (`repositories.js:212-213`) |
| User message, with a range | In the suffix text | In the suffix text | — | In the suffix text | — | Yes, but text only |
| User message, with a node | — | — | **Not stored** | — | — | — |
| `repository_message_graphs` | `commit`, also on every node | Node `path` | Node `id` | Node `line` | — | Yes |
| `board_repository_pins` | `commit_sha` | — | — | — | — | Yes |
| `learn_courses` | `source_version` | — | — | — | — | Yes |
| Card `sources` (kind `code`) | `revision` | `path` | — | `lines` | — | Yes (40-character revision required, `card-sources.js:31`) |
| Canvas `knowledge` block | — | Free-text `path` | Tutor-made ids | — | — | **No.** A model-made concept graph (`LearningBlocks.jsx:599-603`) |
| Anything | — | — | — | — | **No PR field anywhere** | — |

**Symbol identity across commits:** none. Node ids come from Graphify, one snapshot at a time. No code compares or maps
nodes between two `repository_versions`. Snapshot nodes carry no `community`, so `explain_symbol`'s `community` is always
null (`repository-context.js:25` against `index_repository.py:76-77`).

### 3.6 What the Map renders today (question 7)

- **Data.** `GET /api/repositories/<name>/snapshot` returns `{repo, commit, version, graph, files:[{path,lines}], skipped}`
  (`repositories.js:182-185`). The snapshot is the one at `app.commit_sha`, or at `?commit=` (`:181`).
  - `RepositoryPage.jsx:48` loads it.
  - Files open through `POST …/file` (`repositories.js:186-190`).
- **Navigation.** There are two layers of controls:
  - **Map | Learn** tabs (`RepositoryPage.jsx:59-62`);
  - inside the Map, **Files | Graph** buttons and a Layers icon (`:87-88`).
  - There are no Files / Graph / Learn tabs yet (that is the separate repo-browser brief).
- **Graph** (`RepositoryGraph.jsx`).
  - **Nodes in view:** a d3-force layout of the 24 highest-degree nodes; 45 for a search or a focused node; 100 for an
    answer view (`:31`). At most 250 edges (`:35`).
  - **Drawing:** colour by file (`:17-18`). EXTRACTED edges are solid, all others dashed (`:137`).
  - **Memory kinds** draw as ◆ decision, ■ question, ○ session (`:9,144-147`).
- **Layers.**
  - Code is always on and disabled (`MapMemory.jsx:21`).
  - Decisions, Questions and Sessions are disabled with "None recorded yet" when they have no records (`:24`). Without
    fixtures that is always.
  - With fixtures, `layerGraph` adds record nodes and the edges `decided`, `asked_about` and `touched`, each with
    RECORDED or INFERRED confidence. It adds only records that point at code already in the graph
    (`map-memory.js:12,28-40`).
- **Selected panel** (`RepositoryPage.jsx:105-112`):
  - the node's label and `path:line`;
  - Why / Questions / Sessions sections, which in production show "No recorded project decision explains this code
    yet." and "No … recorded yet" (`MapMemory.jsx:40-46`);
  - the node's edges, each with its confidence (`RepositoryPage.jsx:73,108`);
  - **Learn this**.
- **Answer graphs.** Repository answers can carry a graph (live `graph` event, `ask.jsx:685`, or from history through
  `repository_message_graphs`). **Show on graph** puts it on the Map (`ask.jsx:924`, `agent/ResultSheet.jsx:84`,
  `RepositoryPage.jsx:35-36`).
- **Elsewhere.**
  - The canvas `knowledge` block reuses `RepositoryGraph` for model-made graphs (`LearningBlocks.jsx:1222-1229`).
  - The Small app page has an empty "App graph" box (`SharePage.jsx:836-837`).
  - `graph-context.js` is about interactive math graphs, not repositories.

## 4. Gaps: the minimal data each missing edge would need

These are proposals only. Nothing below was built or migrated. Four constraints apply to all of them:
- **Code endpoints carry `commit_sha`**, because node ids exist only within a snapshot.
- **Every record keeps provenance:** who or what recorded it, and when.
- **RECORDED and INFERRED stay distinct.** This is the contract the fixtures already use (`map-memory.js:36`,
  `MapMemory.jsx:16`).
- **A visibility model is needed.** The fixtures model `visibility` and `owner` (`map-memory-data.js:7,11`), with
  filtering in `visibleMemory` (`map-memory.js:16-21`). Real repository projects are owner-only (`repositories.js:61-64`,
  `project-map-learn.md:58-59`), and chats are per user (`repositories.js:196-197`). Organisational memory needs that
  model before anything is shared.

| Gap | Unlocks | Minimal data (proposal) |
|---|---|---|
| G1. Questions lose their structured code context | Question → Code (canonical); history order | Store the request's `repository_context` with each user message: `node_id`, `path`, `start_line`, `end_line` and `commit_sha`. Today the node is dropped and the range survives only as text. Also give LEARN_DB `messages` a `created_at`. |
| G2. No Session record | Session → Decision; Session → Question; history | Either accept a chat thread as a Session (option A below), which needs only `messages.created_at` and a last-turn time on `threads`. Or add a work-session record from capture (Knowledge Capture v1, `rabbit-hole-checklist.md:330-332`): `id, repository_id, participant user id, agent, started_at, ended_at, summary, transcript reference, visibility`. |
| G3. No Decision record | Every Decision edge | `id, repository_id, title, rationale, alternatives, status, recorded_by, captured_from (manual or extracted), visibility, created_at, updated_at, superseded_by`. These are the fields the fixture and the Coaching corpus already use. |
| G4. No stored relationship between knowledge nodes | Session→Decision, Session→Question, Question→Decision, Decision→Code, Question→Code | One link record: `from_kind, from_id, relation, to_kind, to_ref, confidence (RECORDED or INFERRED), score, evidence (message ids or a quote), created_by, created_at`. For a code target, `to_ref = {repository_id, commit_sha, node_id or path, start_line, end_line}`. Relation names should follow the owner's vocabulary (produced, discussed, raised, changed, affected, concerns, led_to, implemented_by, related_to). The fixtures use `decided`, `asked_about` and `touched` (`map-memory.js:12`). |
| G5. No commit history or PRs | Decision → implemented_by → commit / PR | Commit metadata: `sha`, parents, author date, message. PR data: number, URL, merge SHA. The indexer fetches neither (`repository_jobs.py:43`, `index_repository.py:59`), and GitHub REST was already rejected for its anonymous quota (`learn-repositories.md:52-56`). Cheapest honest step: allow only commits that exist in `repository_versions`, and defer PRs. |
| G6. No identity across commits | A history view of Code and Code→Code over time | A stable symbol key across snapshots, such as `(path, qualified name)` or a diff mapping, and real commit times. `repository_versions.created_at` is index time only. |
| G7. Symbols have no range | Decision / Question → symbol range | An end line on snapshot nodes. Graphify's `source_location` is reduced to its first number today (`index_repository.py:75-77`). |

## 5. Open questions for the owner

**A. Is a repository chat thread a Session, and are its user messages Questions?**
1. Yes. This gives a canonical Session → Question edge today, and Question → Code after G1. These records are private to
   their user.
2. No. Sessions and Questions come only from Knowledge Capture v1.
3. Both, as distinct kinds: "chat" sessions now, and work sessions from capture later, each labelled for what it is.

Recommendation: **3**. The owner's example session (one that produced "threshold 0.50 → 0.72") is a work session, and a
learner's chat never produces a project decision, so the two should not be merged.

**B. Should the Graph show the canonical links outside the owner's list?** These are the answer graph views, the course
commit and card code sources (§2).
1. Yes, as Code-layer context.
2. No, until the four node types have real data.

Recommendation: **2**. Keep the layers to the four types the owner named.
