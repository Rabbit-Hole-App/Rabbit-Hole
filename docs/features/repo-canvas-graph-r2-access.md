# Repository graph Release 2, lane ACCESS: design notes and what is left

Contract: C:/s/spec/repo-graph-r2-plan.md (ACCESS row). Brief: docs/features/repo-canvas-graph.md (section 8, "Persistence
and access", Clarification section 10).

## What the server does now (commit 5c32b2f2)

- **Reads.** A card's code and graph come only from the owner-only routes that already existed:
  - `POST /api/repositories/<app>/file {path, commit}`
  - `GET /api/repositories/<app>/snapshot?commit=`

  Both look up the row by org, name and owner_email. A refusal is a 404 "Repository not found in this workspace", which names nothing.
- **No grant.** A card stores no code (contract), so adding one grants nothing.
- **Redaction** (repository-cards.js `redactRepositoryCards`).
  - A viewer who does not own the card's repository (org and owner_email match on `repository_apps.name`) gets a code or graph card as a whitelist of layout keys plus `redacted: true`:
    - code: `source: {kind:'repository'}`;
    - graph: nothing more.
  - Applied wherever someone other than the owner receives board content: openShared (share and publication), forkSource (share-token and own-canvas paths), startRabbitHole, nextStepsAboutShared, and askShared.
  - The owner's own board GET is never redacted.
  - Upload code cards are left to the canvas asset rules.
- **Save merge** (`restoreRedactedCards`, called first in saveOwn).
  - When an incoming block has `redacted: true` and the stored board holds a full repository card with the same id and type, the full stored card is written back. Only the incoming layout keys are taken, so a move or resize survives.
  - A card missing from the incoming board stays deleted: an explicit deletion is an edit, not an erase.
  - A redacted card with no full stored twin is stored as it came.
  - Why here:
    - Only a board's owner can PUT it. Shared links and publications are view-only, and canvas members comment but do not edit.
    - So the realistic way a redacted card comes back is a stale or redacted copy: a fork, or a future member editor. The merge sits on the one write path every owner save takes.
    - When member editing arrives, the same function covers it, provided the member's PUT also goes through saveOwn or calls the merge.
- **Context.** `cardCodeRefs(env, user, refs, snapshot)` resolves code refs through one owner check, at each ref's own commit:
  - It uses the caller's loaded snapshot for refs that match it.
  - Otherwise it loads a snapshot of a repository the user owns at that commit, at most 3 per question.
  - Failing both, it falls back to the caller's snapshot, which keeps R1's statuses (other_commit, not this repository).
  - Anything else is unavailable, named only by the browser's own label.
  - Wired into repositoryAsk (Main canvas) and projectRepository.selected (project canvases).
- **Client.** `useCardSource(block, {assetUrl})` (use-card-source.js; pure helpers in card-source.js).
  - Returns {status, text, lines, totalLines, graph, retry}.
  - A redacted card, or one with no readable source, is `unavailable` without a request.
  - A 403 or 404 means unavailable; other errors mean failed.
  - One read per file or snapshot across cards.

## Unfinished

1. **Code refs on a canvas outside a project** are not resolved: apiAsk only resolves through `repository.selected`. Wiring cardCodeRefs into index.js directly broke the learn-chat harness (it evals apiAsk's source, so a dynamic import resolves from the test directory). The fix is to pass a resolver through the seam (canvasAskSeam) for every canvas and update learn-chat.test.js deps.
   - The decision that test encodes: a "Borrowed" canvas of someone else's project reads none, even though the fixture owner owns the same repo and commit. Card semantics would read it. The owner needs to rule on this.
2. **The repositoryAsk thread rule** still answers 409 for a ref at another commit of the same repository on an existing thread (R1). A code card pinned to an older commit therefore cannot join an existing Main-canvas thread. To change: drop that check when cardCodeRefs can load the ref's commit.
3. **Not covered by tests:** redaction in startRabbitHole, nextStepsAboutShared and askShared (the code paths are wired; only openShared and fork are tested).
4. **Thumbnails** (Explore and card thumbnails) are rendered by the owner's browser and can show a code card's text as pixels. Not handled.
5. **No browser run:** useCardSource has not been exercised in a browser. CODE and GRAPH render it; DROP decides the upload card's assetUrl.
