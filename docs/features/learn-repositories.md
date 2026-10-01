# Public repositories for Learn

Regular Small dev only. Import a public GitHub repository and selected branch
through Apps, without creating a runnable deployment. Repository projects stay
in the existing Apps list/sidebar and open Learn or Code (Files / Graph).

## Plan and acceptance

- [x] Install pinned Graphify and index public source without executing it.
- [x] Import URL / branch, show asynchronous status, pin the resolved commit.
- [x] Store source and graph together; manual refresh preserves old versions.
- [x] Browse/search/zoom a graph, inspect extracted versus inferred edges,
      open syntax-colored source and ask about a node.
- [x] Give Learn scoped search, relationships, source reading and overview tools.
- [x] Reuse owner-approved curriculum and Learn chat/history/canvas flows.
- [x] Test a real nanoGPT import, source citations, permissions and refresh;
      deploy and verify the regular dev UI.

## Boundaries

Public GitHub only; no repository execution, credentials, private GitHub access,
local uploads, automatic branch tracking or changes to live/Amazon BYOC.
Graphify is a retrieval index, not evidence of undocumented builder intent.
Preserve confidence labels and verify implementation claims against source.
No token-saving claim until measured against direct source retrieval.

Use a separate dev D1 database for project metadata, courses and private chat
history; R2 stores immutable snapshots under a dev-only prefix. The existing
dev Python worker gains a bounded indexing subprocess using Graphify 0.9.63.
Its service credential is excluded from that subprocess. The worker downloads
only fixed GitHub hosts and inspects text; repository scripts never run.
Indexing excludes oversized/binary content and reports omissions.

Workspace membership comes from the existing authenticated control plane.
Imported public projects are visible to that workspace; only the importer can
refresh or author their course. Chat history remains per-user.
Courses and conversations record a commit so source links survive a refresh.

## Implementation and use

In the regular dev Apps list, choose **Import repository**, enter a public GitHub
URL, select a branch, and import. The new repository project opens **Code** with
**Graph** and **Files** views. Select a node to open its source in the right panel;
the chat composer stays visible. Drag the right panel's edge to resize it (arrow
keys also resize; double-click resets). Double-click a graph node to expand its
neighborhood; **Back** restores the previous graph and zoom, including nested
exploration. Drag nodes to rearrange the spring-connected graph; drag empty space
to pan. Motion settles after interaction and respects reduced-motion preferences.
**Learn** opens the existing canvas, private chat history and Curriculum controls.
Repository projects start without the unrelated scripted lesson demo.

The backend resolves branches with anonymous `git ls-remote` on the existing dev
Python worker. It downloads a codeload archive at the exact commit, then runs
Graphify's deterministic code extraction in a bounded subprocess. Public GitHub
REST branch listing was rejected after its shared anonymous quota blocked a real
dev test; no GitHub token is required for this implementation.

- Package: `graphifyy==0.9.63`; local environment `.small/graphify-venv`, worker
  environment `/opt/indexer`. No agent hooks or global skill installation.
- Metadata, courses and conversations: dev-only `small-learn-dev` D1 / `LEARN_DB`.
- Source and graph: immutable R2 snapshots under `learn-repositories-dev/` in the dev-only
  bucket `small-repositories-dev` (binding `REPOSITORY_SNAPSHOTS`), never the live
  `small-runs` bucket (2026-09-28).
- Async coordinator: `REPOSITORY_IMPORTS`; worker: `small-lesson-renderer-dev`.
- Limits: 20 MB compressed, 32 MB expanded, 8 MB indexed text, 512 KB per file,
  2,000 indexed files, 10,000 nodes and 30,000 edges. Excluded files are listed.
- The graph initially shows 24 connected nodes; search/neighborhood views show
  up to 45. This is a view of the index, not the complete graph at once.
- Tutor tools: `get_repo_overview`, `search_code`, `get_relationships`,
  `explain_symbol`, `find_connection_path`, `query_graph`, `read_source`.
  Structural questions use the graph directly with edge direction/confidence;
  paths search both directions up to eight hops and are not runtime call traces.
  Reads return at most 120 numbered lines; source is checked before
  implementation claims. The model does not receive the entire repository.
- Refresh is manual and owner-only. Unchanged commits reuse the snapshot; failed
  refreshes leave the previous commit usable. Conversations keep their original
  commit. A selected node from another commit requires a new chat.

## Indexer credential (`SCENE_WORKER_TOKEN`)

Branch lookup and import call the lesson-renderer Fly app through `workerRequest`
(`packages/control-plane/src/learn-scene.js`) with `SCENE_WORKER_URL` (a plain var) and the
bearer secret `SCENE_WORKER_TOKEN`. The renderer compares the bearer to its own
`SCENE_WORKER_TOKEN` (`packages/lesson-renderer/server.py`). Both sides must hold the same value.

- **Fly:** app `small-lesson-renderer-dev` (`packages/lesson-renderer/fly.dev.toml`), Fly org
  `personal`. Holds the secret (`flyctl secrets list` shows a digest only). Temporary: see Migration below.
- **Cloudflare:** every Worker whose `main` is `packages/web/dev-worker.js`, because only that
  entry routes `/api/repositories` to `repositories.js`: `small-cp-dev` (`wrangler.dev.jsonc`),
  `small-cp-dev-small-parallel` (`wrangler.parallel.jsonc`) and any `small-cp-dev-<worktree>`
  clone. `rabbit-hole-cp-dev` and production `small-cp` run `src/index.js`, which has no
  repository import, so they do not need it.
- **Local:** `wrangler dev -c packages/web/wrangler.dev.jsonc ...` reads
  `packages/web/.dev.vars` (gitignored). Add `SCENE_WORKER_TOKEN=<value>` there; `SCENE_WORKER_URL`
  comes from the config. Plain `npm run dev` (Vite) proxies `/api` to `rabbit-hole-cp-dev`, which
  has no repository import.
- `flyctl secrets list` shows only a digest and Cloudflare secrets are write-only.
  `make clone-scene-token` copies the value out of a running Fly machine over SSH, which needs the
  stopped machine started. Rotating is the cleaner way to wire a Worker.
- **What the learner sees** (`repositoryMetadata`, branch lookup and import): a missing URL or
  token answers 503 "Repository import is unavailable because the indexing service is not
  configured on this server." (a URL that is not `https://` counts as missing); a 401/403 from Fly answers 502 "...rejected this server's
  credential."; a network error, timeout or 5xx answers 503 "...did not respond. Try again in a
  minute." So does a redirect or any answer that is not the worker's JSON (such as a proxy's HTML
  error page). A 4xx with a reason (such as no public repository) keeps 400 and that reason. Never 401,
  which the web app reads as signed out. Nothing is written in any of these cases.

**Rotation** (last run 2026-10-01, owner-approved, on Fly, `small-cp-dev` and the
`small-cp-dev-rabbit-hole-scene-worker` clone). One new value goes to every side, never printed. Git Bash, repo root, with Fly logged in and a rabbit-hole Cloudflare credential loaded
(`wrangler.dev.jsonc` pins `account_id`).

```bash
t=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
# Fly reads NAME=VALUE from stdin, so the value never sits in argv. Without --stage this
# updates (restarts) the app's machines; a stopped machine picks the value up on its next start.
printf 'SCENE_WORKER_TOKEN=%s\n' "$t" | flyctl secrets import -a small-lesson-renderer-dev
# Repeat for each dev-worker.js Worker that exists (small-cp-dev today).
(cd packages/web && printf '%s' "$t" | npx wrangler secret put SCENE_WORKER_TOKEN --config wrangler.dev.jsonc --name small-cp-dev)
unset t
```

- `flyctl secrets set -a small-lesson-renderer-dev SCENE_WORKER_TOKEN=...` works too, but puts the
  value in argv. `--stage` on either Fly command stores the secret without restarting;
  `flyctl secrets deploy -a small-lesson-renderer-dev` applies it later. Recommended: no
  `--stage`. `server.py` reads the token once at start, so a staged value does nothing until that
  second step, and the app has no users to protect from a restart.
- Between the two setters, imports fail with the wrong-credential error. Rotation also breaks any
  other holder of the old value, such as the quarantined personal-account `small-cp-dev`.

**Migration to a Rabbit Hole-owned indexer (not started).** `small-lesson-renderer-dev` lives in the old
personal Fly org and is only the stopgap that closed the dev import bug. The permanent dev indexer is a new
Fly app in the `rabbit-hole` org, for example `rabbit-hole-lesson-renderer-dev`, deployed from
`packages/lesson-renderer` with a fly.toml of that name, using a Fly token scoped to the `rabbit-hole` org.
It gets its own freshly generated `SCENE_WORKER_TOKEN`, set the same way as above. Then `SCENE_WORKER_URL` in
`packages/web/wrangler.dev.jsonc` and `wrangler.parallel.jsonc` and the Makefile `clone-scene-token` target
are repointed. Verify one import, then retire the personal app with the owner's approval.

## Graph and source interactions

- Nodes use file colors, gray external dependencies, and muted edges. Selected
  connections stand out; source labels stay neutral. The force layout settles,
  can be dragged directly, and has a reduced-motion alternative.
- One clickable information control next to zoom contains counts, confidence
  legend and short wrapped instructions. No persistent legend row or indexer
  version string covers the graph.
- The selected symbol's relationships appear below the graph. Selecting a node
  sets chat context automatically, displayed as a compact green outlined pill
  with its clear button beside the label.
- Graph tool results automatically display when their answer completes. Each
  answer retains a **Show on graph** pill; the exact commit, nodes and edges are
  saved in the private chat's `repository_message_graphs` record. Back restores
  the previous graph view, positions and zoom. Reopening History never reruns the
  model merely to reopen a graph.
  The pill appears below the answer. Clicking empty graph space deselects its
  node; dragging the same space pans. Learn has a visible Graph header button.
  Graph and Learn use matching view-title/repository headers and blue primary
  navigation buttons. Returning from Learn selects Graph even after Files.
- Drag-select source text, or click a line number then Shift-click another, to
  attach up to 120 lines. The composer shows the filename, line range, code
  preview and clear button. The backend resolves those lines from its immutable
  snapshot instead of trusting client-supplied code. Mismatched chat commits fail.
- Inline file citations and unambiguous short references such as `line 45` open
  the source in the same right panel and highlight the exact lines. Short
  references remain plain text if the answer cites multiple possible files.

Repository deletion, private repositories, automatic branch tracking, semantic
media indexing and a token-efficiency benchmark are deferred. Curriculum context
is explicitly partial (overview, README and bounded central-source excerpts);
this release does not establish curriculum quality for arbitrary repositories.

## Verification

[Measured dev results and review](../testing/learn-repositories-results.md).
Real nanoGPT import and one real source-backed model answer, followed by browser
checks of graph/source navigation, history, Learn, branch selection, refresh and
access denial. The repository and related Learn suites passed 68 JavaScript
tests; archive handling passed three Python tests. No live or BYOC deployment.

References: [Graphify](https://github.com/Graphify-Labs/graphify),
[package and version](https://pypi.org/project/graphifyy/0.9.63/).
