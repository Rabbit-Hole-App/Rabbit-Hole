# Asking about a shared canvas

A shared canvas (`/b/<token>`, [canvas-sharing.md](canvas-sharing.md)) has the main composer at the bottom.
Anyone who can open the link sees it; sending needs an account. Answers land in a window that only the viewer
sees, and nothing is written to the owner's board, threads or any owner data. Keeping the work is Fork
([canvas-forking.md](canvas-forking.md)), which copies the canvas, never the viewer's chat.

## Spec (owner, locked)

- The page reuses Learn's composer shell (`ChatComposer` with `dock`), in the canvas's own composer slot
  (`AdaptiveCanvas composer=`), so it sits where Learn's does. The header keeps the product top left and the
  fork count and Fork top right.
- Signed out: typing works. Send keeps the draft (`sessionStorage`, per link) and goes to
  `/login?next=/b/<token>?ask=1` exactly as Fork does with `?fork=1`; production sends `/login` on to `/sign-in`
  with `next`. Back with `?ask=1`, the draft is restored and the composer focused; it is never sent by itself,
  and `?ask=1` leaves the address. A session that ends while the page is open does the same on a 401.
- Read-only context pills above the composer: the repository and its pinned commit (`karpathy/nanoGPT · 3adf61e`)
  when the share may show it (C below), then the board's sources (videos, Wikipedia articles, arXiv papers), four
  shown and `+N more`.
- The viewer's conversation stays in their tab (`sessionStorage`, keyed by link and viewer email) and its last
  answered turns ride with each question as history. Clear empties it.
- Answers render with `Md` and no `onFile` (E below).

### Shared canvas v1 decisions (owner, 2026-10-04)

- **A. The viewer's chat stays private.** Fork copies the canvas and its content, never the viewer's shared-page
  conversation. The window's heading says "Only you see this chat. Fork to make your own editable copy." The fork
  request from this page is `{ source: { token }, key }` only; the server forks the stored board and ignores
  anything else in the body (`state`, `history`, `chat`). Nothing of the chat is stored anywhere, so the owner,
  other viewers and viewers of a fork never see it. Sharing it would be a separate, explicit opt-in feature.
- **B. A share answers from a pinned repository commit.** share -> canvas -> repository -> pinned commit. The pin is
  taken when the view link is made (`share()`): the board's own project (a `repo-*` board, or a canvas's `project`)
  at its current commit, or a fork's inherited revision. The same link keeps its pin whatever the owner refreshes;
  changing Public keeps it; turning the link off and on makes a new link, which is a new share, pinned again. A fork
  inherits the revision it was forked at (the share's pin through a link; your own canvas's current commit from the
  Library or top bar) and its own share answers from it. The current HEAD is never used in place of a pin: a pinned
  snapshot that is gone answers from the canvas only, with a notice under the answer.
  **Backfill:** a link made before this shipped has no pin row; it is pinned at its first open or ask after the
  deploy (the repository's commit then), and holds from then on.
- **C. A share link never grants a private repository by itself.** A public repository's code is used normally, at
  the pinned commit. A private one's code, name and commit reach the page and the model only when its owner switched
  on "Allow questions to use private repository code" for this link (Share panel: "Signed-in viewers' questions can
  use code from <repo> at <short commit>, the revision pinned for this link. Off: only this canvas's cards, notes
  and sources."). Off by default and for every new link, per share, kept and enforced on the server; nothing the
  client sends counts. Off, questions use only the shared canvas's cards, notes and content and its explicitly
  shared sources - never the repository's files. Unknown visibility is private.
- **D. Limits and usage.** Sign-in is required; each admitted question is one `shared_canvas_ask` usage event and
  counts against per-viewer and per-share limits (one config place, below). Usage & Credits will meter it to the
  viewer, the signed-in account that asked - never to the owner because someone opened their share. Over a limit: 429 with a message that
  says which, shown in the viewer's window, with the question put back in the composer. No limit or failure touches
  the owner's canvas.
- **E. Citations stay plain text.** File citations such as `model.py:62-64` are not clickable on a shared page and
  never open the owner's repository viewer (`ponytail:` in `SharedBoardPage.jsx`). A future shared source viewer may
  make them clickable only if it is scoped to the authorized share, its pinned commit and the allowed material.
- **F. A plain Q&A surface.** No `+`, attachments, Auto/model picker or `/` commands on the shared composer. The
  server reads only `message` and `history`: a model, command, mode or file in the request is ignored, a multipart
  upload is refused (400), and a message starting with `/` reaches the model as a plain question - nothing on this
  route dispatches commands.

## Permission and data model (C)

How visibility is known: a repository comes in only through `POST /api/repositories`, whose metadata read is the
indexer's anonymous `git ls-remote` (no credentials), so an import or a refresh that succeeds confirms the repository
public at that moment. There is no GitHub API flag and no stored token.

| Table (LEARN_DB) | Columns | Written by | Read by |
|---|---|---|---|
| `repository_visibility` | `app_id` (= `repository_apps.id`), `visibility` (`'public'`), `checked_at` | `repositories.js` `enqueue` on import and refresh: `public` when the anonymous read succeeds; the row is deleted when the indexer refuses a refresh (private now, gone, or branch gone). An outage leaves it. | `shareSource` |
| `board_repository_pins` | `board_id` (= `learn_boards.id`), `repository_id`, `commit_sha`, `view_token` (the link it was taken for; NULL for a fork's inherited revision), `repo_access` (0/1), `pinned_at` | `share()` and the first open or ask of an unpinned link (`sharePin`); the fork batch (inherited row); `POST .../share/repository` (`repo_access` only) | `shareSource`, `boardRevision` |

`shareSource` (`learn-shared-ask.js`) decides, on every open, ask and fork:

- `public`: a `repository_visibility` row says `public`. No row is unknown, which is private.
- `owned`: the repository's `owner_email` is the shared board's owner.
- `allowed`: `public`, or `owned` and the pin's `repo_access` is 1. A fork's share is never `owned` for someone
  else's repository, so a fork can never open up another person's private repository.

Who can set what: only the board's owner, through `POST /api/learn/boards/:app/:board/share/repository { allow }`
(`boardOwner`: a canvas's owner, or the repository's importer for a `repo-*` board). It answers 409 unless the
board's view link is on and its repository is the owner's own and not confirmed public, and it writes only that
link's pin. A new link starts with it off. The owner's `GET /api/learn/boards/:app/:board` and the share route's
reply carry `sharing.repository: { repo, commit, private, repo_access }` for the Share panel, only for the owner's own
repository; the panel shows the switch only when `private` is true.

What a viewer and the model see:

| Case | Shared GET `context.repository` | Model context | Repository tools |
|---|---|---|---|
| Public repository | `{ repo, commit }` (the pin) | `repository: { repo, commit }` | yes, on the pinned snapshot |
| Private or unknown, owner switched it on for this link | `{ repo, commit }` | `repository: { repo, commit }` | yes, on the pinned snapshot |
| Private or unknown, not switched on (or a fork's share) | `null`, no pill; a `repo-*` board's `app` is null and its title `Shared canvas` | no `repository` key; the system prompt says no code is available | no |
| Allowed, but the pinned snapshot is gone | as allowed | `repository` with a note: no source at the pinned commit | no; `done` carries `notice` |

In every case the model also gets the canvas title, the board as text and its sources: shared material. A fork of a
hidden `repo-*` board is titled `Shared canvas` and its provenance carries no repository name.

## Limits and usage (D)

Searched on main first: the login-link and CLI-code limits are atomic `INSERT ... WHERE (SELECT COUNT(*)) < cap`
statements on DB (`auth.js`, `index.js`) with inline constants; there is no rate-limit binding, Durable Object or usage
ledger on main, and Tutor telemetry is response-only. Usage & Credits is unmerged. So the shared ask reuses the
atomic-insert pattern on its own LEARN_DB table, with the caps in one place:

| Var (a worker var of this name overrides; whole numbers only) | Default | Counts |
|---|---|---|
| `SHARED_ASK_VIEWER_HOUR` | 20 | one signed-in viewer's questions on any shared canvas, last hour |
| `SHARED_ASK_VIEWER_DAY` | 60 | the same, last 24 hours |
| `SHARED_ASK_SHARE_HOUR` | 60 | every viewer's questions on one shared board (all its links), last hour |
| `SHARED_ASK_SHARE_DAY` | 300 | the same, last 24 hours |

`SHARED_ASK_LIMITS` and `sharedAskLimits(env)` in `learn-shared-ask.js` are that place; none is set in a wrangler
config, so the defaults apply until one is.

The usage event is the `shared_ask_events` row the admission inserts:
`{ id, category: 'shared_canvas_ask', asked_at (unix seconds), viewer_email, board_id, owner_email, repository (0/1) }`.
Never the question, the answer, the history or any source; the board id, not the link's token. It is written only
when a question is admitted, before the model call, so a refused request (400, 401, 404, 429, 503) writes nothing
and a failed model call still counts. Billing (owner, 2026-10-04): when Usage & Credits lands it meters
`shared_canvas_ask` to `viewer_email`, the requester; `owner_email` only records whose share it was and is never
charged. No second billing system: these rows are the event it reads. `ponytail:` rows are never pruned; Usage &
Credits takes them over when it lands.

## API

`POST /api/learn/boards/shared/:token/ask` (`learn-boards.js` routes, `learn-shared-ask.js` answers).

| Part | Contract |
|---|---|
| Request | `{ message, history? }`. `message` 1-4000 characters. `history` a list of `{ role: user\|assistant, content }`; the last 10 are used, each cut to 4000 characters, a leading assistant turn dropped. Anything else in the body is ignored. Body over 128 KB: 413. |
| Who | `sharedAccess` (the link is live; a non-public link needs an account) and a signed-in viewer on every link. |
| Refusals | 404 dead or revoked link; 401 `{ signIn: true }` signed out (public links too); 400 bad message or history (a multipart body too); 503 no model configured; 403 the dev subscription's owner gate (`subscriptionOwnerRefusal`); 429 `{ error, limited: true }` over a limit. |
| Reply | `text/event-stream`, the Learn chat events: `progress`, `chunk`, `papers`/`paper` (arXiv), `error`, then `done { ok: true, notice? }`. No thread id, no graph, no video. |
| Writes | One `shared_ask_events` row per admitted question and, for a link from before pinning, its pin. Nothing of the owner's: `onDone` is null and there are no video tools, so no thread, message or `learn_moments` row. |

`GET /api/learn/boards/shared/:token` also returns `viewer` (the caller's own email, or null signed out) and
`context: { repository: { repo, commit } | null, sources: [{ kind, title, id? }] }` (C decides `repository`).

`POST /api/learn/boards/:app/:board/share/repository { allow: boolean }`: owner only (C).

## What the model sees

Built from the shared row only (`askShared`), never from the request beyond `message` and `history`:

- Learn chat's configuration: `askStream`'s research path, `LEARN_TASKS.chat` (Auto, 2400 tokens, the arXiv
  research tools), and `SHARED_CANVAS_SYSTEM` (`agents/learn-chat.js`: Learn's teaching policy and answer style,
  plus what a shared-canvas request supplies, that no repository means no code, and that the chat is the viewer's
  own). The request cannot pick the model.
- `canvas`: the canvas title (`sharedTitle`). `content`: the board as text - headings, cards (title, question,
  prompt, text, brief, caption, code), notes and shape labels, and its finished chat exchanges and replies; 1,500
  characters an entry, 24,000 in all, each cut marked. `sources`: as on the pills.
- `repository: { repo, commit }` only when allowed (C), at the pinned commit (B), with the read-only repository tools
  (`REPOSITORY_TOOLS`, `REPOSITORY_SYSTEM`) on that snapshot (`repositorySnapshot`).

## Privacy

- The page already exposed the board state, title, app name and owner email; this adds the repository name and
  pinned commit only when C allows, the sources (derived from that state) and the viewer's own email.
- The answer stream carries only the answer and its events: no owner email, row ids, repository ids, storage
  keys or other canvases. The model request carries no owner email and nothing from the owner's other canvases.

## Migrations before any deploy, in order

All LEARN_DB, additive and re-runnable, applied to local D1 only (`--local --persist-to`) - **not to any remote D1**.
From `packages/control-plane`, once a deploy is approved, before the code that reads them:

1. `learn-migrations/0004-canvas-forks.sql` ([canvas-forking.md](canvas-forking.md)).
2. `learn-migrations/0005-shared-canvas-v1.sql`: `board_repository_pins`, `repository_visibility`,
   `shared_ask_events`. Tables and indexes only, **no backfill** (owner, 2026-10-04: a migration never broadens
   visibility; nothing stored before it says a repository is public). Every existing repository stays unknown, so
   private to shares, until its owner imports or refreshes it (the anonymous `git ls-remote` marks it public) or
   switches on private repository code for a link. So after this ships, an existing public repository's shares show
   no repository pill and read no code until its owner refreshes it. Dev:
   `npx wrangler d1 execute rabbit-hole-learn-dev --remote -c wrangler.rabbit-hole-dev.jsonc --file learn-migrations/0005-shared-canvas-v1.sql`;
   production: `rabbit-hole-learn-prod` with `-c wrangler.rabbit-hole-prod.jsonc` (names from those configs' `LEARN_DB`).

Both are also in `repository-schema.sql`. Without 0005 the share, open and ask routes fail on the missing tables; an
import still works (its visibility write is best effort and leaves the repository unknown, so private to shares).

## Verification

- `packages/control-plane/test/shared-canvas-ask.test.js` (8, the original spec) and `test/shared-canvas-v1.test.js`
  (18: A 1, B 4, C 6, D 5, F 1, Lineage 1), both on `test/shared-canvas-fixture.js`. "C migration" applies 0005 to a
  database with existing repositories and proves none becomes public and the file writes no rows. "Lineage": a fork
  of a fork is owned and editable by its forker, names its source, keeps parent, root and the pinned revision.
  `test/repositories.test.js` "C visibility" (import, refresh, refusal, outage).
- `packages/web/src/shared-ask.test.mjs` (9: the original 4, then A, B, C, D, F).
- `packages/web/e2e/shared-canvas-ask-check.mjs` (local stack only, the ask route scripted in the browser, the app
  worker run without model keys): the original walk plus the pinned commit across an owner refresh, `/` as a plain
  question, a 429 in the viewer's window with the draft kept, the fork holding no viewer chat, a private repository's
  canvas with no pill, and the owner's Share panel switch turning it on. Screenshots in the given directory.

## Known limits

- E: citations are plain text (above).
- Visibility is what the last anonymous import or refresh confirmed. A repository made private after that stays
  `public` until a refresh is refused; its pinned snapshot was public when it was indexed.
- The code never deletes snapshots (`repository_versions` rows and R2 keys are per commit); a bucket lifecycle rule
  outside the code could remove one, and the share then answers without code (B).
- Uploaded PDFs on the board are not listed as sources (only arXiv paper cards).
- The forker's own Learn chat on a fork has no repository context (a fork has no project); only the fork's share
  uses the inherited revision.
- Not deployed.
