# Asking about a shared canvas

A shared canvas (`/b/<token>`, [canvas-sharing.md](canvas-sharing.md)) has the main composer at the bottom.
Anyone who can open the link sees it; sending needs an account. Answers land in a window that only the viewer
sees, and nothing is written to the owner's board, threads or any owner data. Keeping the work is Fork
([canvas-forking.md](canvas-forking.md)).

## Spec (owner, locked)

- The page reuses Learn's composer shell (`ChatComposer` with `dock`), in the canvas's own composer slot
  (`AdaptiveCanvas composer=`), so it sits where Learn's does. The header keeps the product top left and the
  fork count and Fork top right.
- Signed out: typing works. Send keeps the draft (`sessionStorage`, per link) and goes to
  `/login?next=/b/<token>?ask=1` exactly as Fork does with `?fork=1`; production sends `/login` on to `/sign-in`
  with `next`. Back with `?ask=1`, the draft is restored and the composer focused; it is never sent by itself,
  and `?ask=1` leaves the address. A session that ends while the page is open does the same on a 401.
- Read-only context pills above the composer: the project's repository and commit (`karpathy/nanoGPT · 3adf61e`)
  when the canvas belongs to one, then the board's sources (videos, Wikipedia articles, arXiv papers), four shown
  and `+N more`.
- The viewer's conversation stays in their tab (`sessionStorage`, keyed by link and viewer email) and its last
  answered turns ride with each question as history. Clear empties it.
- Answers render with `Md` and no `onFile`: a shared view cannot open the owner-only repository file viewer, so
  cited files show as plain pills and there is no Sources dropdown (`ponytail:` in `SharedBoardPage.jsx`).

## API

`POST /api/learn/boards/shared/:token/ask` (`learn-boards.js` routes, `learn-shared-ask.js` answers).

| Part | Contract |
|---|---|
| Request | `{ message, history? }`. `message` 1-4000 characters. `history` a list of `{ role: user\|assistant, content }`; the last 10 are used, each cut to 4000 characters, a leading assistant turn dropped. Anything else in the body is ignored. Body over 128 KB: 413. |
| Who | `sharedAccess` (the link is live; a non-public link needs an account) and a signed-in viewer on every link. |
| Refusals | 404 dead or revoked link; 401 `{ signIn: true }` signed out (public links too); 400 bad message or history; 503 no model configured; 403 the dev subscription's owner gate (`subscriptionOwnerRefusal`). |
| Reply | `text/event-stream`, the Learn chat events: `progress`, `chunk`, `papers`/`paper` (arXiv), `error`, then `done { ok: true }`. No thread id, no graph, no video. |
| Writes | None. The handler prepares only SELECTs on LEARN_DB; `onDone` is null; no video tools, so no `learn_moments` row. |

`GET /api/learn/boards/shared/:token` now also returns `viewer` (the caller's own email, or null signed out) and
`context: { repository: { repo, commit } | null, sources: [{ kind, title, id? }] }`.

## What the model sees

Built from the shared row only (`askShared`), never from the request beyond `message` and `history`:

- Learn chat's configuration: `askStream`'s research path, `LEARN_TASKS.chat` (Auto, 2400 tokens, the arXiv
  research tools), and `SHARED_CANVAS_SYSTEM` (`agents/learn-chat.js`: Learn's teaching policy and answer style,
  plus what a shared-canvas request supplies). The request cannot pick the model.
- `canvas`: the canvas title. `content`: the board as text - headings, cards (title, question, prompt, text,
  brief, caption, code), notes and shape labels, and its finished chat exchanges and replies; 1,500 characters an
  entry, 24,000 in all, each cut marked. `sources`: as on the pills.
- `repository: { repo, commit }` when the board is a `repo-*` project or a canvas whose `project` is one, read as
  the owner's `repository_apps` row. The snapshot at that commit (`repositorySnapshot`) backs the read-only
  repository tools (`REPOSITORY_TOOLS`, `REPOSITORY_SYSTEM`) without the owner-only access check. A missing
  snapshot answers without the tools and the context says so.

## Privacy

- The page already exposed the board state, title, app name and owner email; this adds the public GitHub
  repository name and commit, the sources (derived from that state) and the viewer's own email.
- The answer stream carries only the answer and its events: no owner email, row ids, repository ids, storage
  keys or other canvases. The model request carries no owner email and nothing from the owner's other canvases.

## Verification

- `packages/control-plane/test/shared-canvas-ask.test.js` (8): signed out 401 on public and private links with
  no model call; dead and revoked links 404; the page's repository, commit, sources and viewer; the answer from
  board, sources and the repository at the shared commit (a scripted `read_source` call); history capped at 10
  and each turn cut, malformed bodies 400 and an oversized one 413 before any model call; only SELECTs on LEARN_DB
  and the owner's board, threads and forks unchanged (shown failing with a write added); no leaks and nothing
  from the request body beyond message and history reaching the model.
- `packages/web/src/shared-ask.test.mjs` (4): the sign-in round trip and draft, per-viewer chat and history,
  source pins for the composer in the canvas slot with read-only pills and `Md` without `onFile`, and no
  auto-send.
- `packages/web/e2e/shared-canvas-ask-check.mjs` (local stack only, 23 checks, the ask route scripted in the
  browser, the app worker run without model keys): a project canvas shared publicly; the real route's 401, 404
  and 400; the signed-out composer and pills; Send to sign-in with the draft kept; the draft back, focused and
  unsent; a signed-in answer in the viewer's window and a follow-up carrying history; the chat surviving a
  reload; the owner's board version and threads unchanged; Fork. Screenshots in `.small/shared-ask-shots/`.

## Known limits

- The viewer's conversation does not travel into a fork: a fork copies the server board only, and adding the
  viewer's turns as settled chat cards would need the fork route to merge client exchanges. Left out.
- The commit is the repository's current `commit_sha`; an owner's refresh moves it for every viewer.
- Uploaded PDFs on the board are not listed as sources (only arXiv paper cards).
- No per-user usage limit exists for Learn asks yet (`ponytail:` in `learn-shared-ask.js`).
- No schema change, nothing to migrate. Not deployed.
