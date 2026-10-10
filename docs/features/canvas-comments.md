# Canvas comments and members (V1 design)

Status: **IN IMPLEMENTATION on `feature/comments-v1` (owner GO 2026-10-07: "start building comments mvp"), local only: no
merge, dev migration or deploy without the owner. Built: migration 0011 (Home reviewed the shape); both route families
with one `can()`; the owned canvas's Comments view, pins, replies, resolve, edit, delete, Add comment / Add comment here,
the Comment tool and `C`; Allow comments and Public comments in Share; the published page; members and recipient-only
invitations (H7, Home's code review applied) with `/i`, `/c` and People with access; mentions; unread dots, Library news
and Shared with you; thread links, paging, Show comments, Block / Unblock; the members panel on share links.
Not built yet: Start Rabbit Hole and Fork on `/c` (they need a member-source provenance contract beside the share-link
one, in dives and canvases), the phone bottom sheet check, and Home's cards.**

**Revision 5 (targeted corrections after the revision 4 review):**
- moderation keys on the author's account id, so blocking works without handles;
- a complete permissions matrix, by action, audience and mode, including a member who is also blocked from public
  commenting, with one policy for both route families;
- completed API contracts: mention lookup before a thread exists, the mention mapping in create and edit, idempotency scoped
  to author, target and payload, mismatched-id authorization tests, and an explicit thread size limit;
- two Figma sentences corrected;
- Home's invitation-contract corrections C1-C7 applied as written. Per Home, H7 is signed after its diff check of sections
  6, 7, 9, 10 and 13, with no further design round;
- the aggregate newcomer cap moved out of the Q12 recommendation.

- **Branch and worktree:** `feature/comments-v1` in `workspace/comments-v1`, started from main `a0321cef` and
  fast-forwarded to main `8efb6b23` (no commits of its own). Rebase again after #46 before any S1 work.
- **Who does what:**
  - The Motion agent, on temporary assignment as Comments / Collaboration lead, owns the new Comments modules.
  - Parallel keeps review ownership of every existing canvas and sharing file it touches, and merges.
  - Home reviews schema, email, the acceptance contract and infrastructure, and runs any authorized remote migration or
    deploy.
- **Holds:** no test stack, paid call, remote change or deploy was used.
- **Figma mockup:** `ef9SfiemEsPQF2bd8B1os3`, page WP4 · deployed review, frame "Comments V1 · DESIGN MOCKUP rev 3",
  node 236:222, boards 1-17. Review notes are under the boards, never inside the UI or the emails.

**Revision 4:**
- applies Home's review: the permission identity is `member_user_id`; no invitation link is ever exposed in production;
  failed delivery shows "Email wasn't sent · Resend"; the acceptance contract is coordinated with Home;
- adds the revised recipient-verification flow: a fresh code to the invited address for every acceptance, and eight
  invitation screens;
- corrects decision status: only the owner's confirmed decisions are treated as decided, and every other earlier
  recommendation is listed below as an open product choice.

## Decision status

### Confirmed by the owner

- The right-side panel is the Table of contents. It is kept, with two views: Table of contents | Comments (Q15).
- Comments and replies appear in that panel. Add comment, or selecting a comment marker, opens the matching composer or
  thread in Comments.
- Per-canvas members are added and removed by email. Invited members can view and comment only.
- Public commenting needs a Rabbit Hole account. On public canvases with commenting enabled, any signed-in Rabbit Hole
  account can comment.
- Every message shows its author's name and avatar.
- Add comment from a right-click on a card, an artifact or the empty canvas; Start Rabbit Hole stays. Toolbar, keyboard
  and touch entry points too.
- @mentions in new threads and replies. A mention never grants access or reveals a private email address.
- Comments are stored apart from board state, with no canvas-version change and no owner-save conflicts.
- Private discussions cannot leak through publication or forks.
- **Q1:** recipient-only invitations, with stable account ids and account lookup and linking unchanged.
- **Q5:** top-level canvases only in V1.
- **Allow comments (owner, 2026-10-07):** when sharing a canvas, the owner chooses whether others may comment at all (section 4).
- **Full scope (owner, 2026-10-07):** the whole feature is built as designed. The one-day "published canvases only" MVP
  relayed by Home is not adopted.

### Home review, adopted into this design

| # | Requirement | Where |
|---|---|---|
| HR1 | `member_user_id` (`users.id`) is the permission identity. Principal emails are used only to join display data by reference and are never returned | sections 2, 7 |
| HR2 | No production "Copy invite link" and no `invite_url` in any response, including after a failed send | sections 5, 10 |
| HR3 | Failed delivery shows "Email wasn't sent · Resend". Resend issues a fresh invitation link and invalidates the old one | sections 5, 6 |
| HR4 | Every acceptance confirms the invited address with a fresh code; the screens show the account that will receive access | section 6 |
| HR5 | The acceptance contract (section 6) is agreed with Home before S1 is built | section 6 |

### Open product choices (recommendations, not approvals)

Each is a recommendation awaiting the owner. The design is drawn with the recommended option and changes if the owner picks
otherwise.

| # | Choice | Recommended | Alternatives |
|---|---|---|---|
| Q2 | Members-only and public threads | Separate for good | One shared space |
| Q3 | Signed-out visitors on `/e/` | Can read public comments | Signed-in only |
| Q4 | Non-member `/b/` link viewers | See no comments | Read members threads; comment |
| Q6 | How members find shared canvases | Library "Shared with you" + invitation email | Invitation email only |
| Q7 | Indicators | Canvas and Library only; global inbox and email deferred | Add the inbox; add email |
| Q8 | Who resolves | Owner and thread author, subject to access | Owner, author and any member on members threads |
| Q9 | Blocking and existing comments | Kept; "Also remove their comments" offered, unticked | Removed automatically |
| Q10 | A removed member's comments | Stay, attributed | Deleted with the membership |
| Q11 | Invitation limits | 50 members per canvas, 20 invitations per owner per day, 14-day expiry, all configurable | Other values |
| Q12 | Comment limits | Section 9: 5,000 characters, configurable per-person limits and owner moderation; no per-canvas total; the aggregate newcomer cap deferred (manager recommendation) | Add the newcomer cap; a per-canvas total cap |
| Q13 | Card deleted | Keep the thread detached; reattach on restore | Pin at the last known point |
| Q14 | Keyboard | `C`, guarded for typing and embedded editors | No shortcut |
| Q16 | Freshness | Poll while visible and on focus; immediate after one's own actions | Live updates (new infrastructure) |
| Q17 | Email sender | The existing sender, if Home confirms it suits | A separate notifications sender |
| Q18 | Commenting without a handle (HandleGate fails open when profiles are down; API clients) | Allow it, showing the display name, else "Rabbit Hole user"; such authors can't be @mentioned but **can always be blocked**, because blocking keys on the account id (section 3) | Refuse with `needsHandle` |
| Q19 | Owners and members posting publicly | Allowed from their own page via "Visible to" while public comments are Open; default Members only | Only from `/e/` |
| Q20 | Public comments setting | Off / Open / Closed (section 4) | An on/off switch that hides history when off |
| Q21 | Who can block | The owner only | Also trusted members |
| Q22 | Total size of one thread | 1,000 messages per thread (configurable); then "This thread is full. Start a new thread." | No total limit (pagination only) |
| Q24 | "Allow comments" default for a canvas | On (invited members comment, as confirmed) | Off until the owner turns it on |
| Q25 | Existing comments when the owner turns comments off | Stay visible read-only, like Closed | Hidden from everyone but the owner |
| Q23 | Deleting your own comment while you can no longer post (blocked, or public comments Closed) | Allowed: authors can always delete, never edit, their own comments in threads they can still read | Frozen like posting |

## 1. Audit: what exists today (source-backed, at `a0321cef`)

### The right panel is the Table of contents

| Fact | Source |
|---|---|
| `/apps/canvas-<id>` renders `LearnPage`, as does a project's Learn tab | `web/src/CanvasPage.jsx:23`; `web/src/RepositoryPage.jsx:72` |
| The right panel is one `ResizableSidePanel`: 480 px (320-800), closed on load, toggled by the header's `PanelRightOpen/Close`; it stacks under the canvas below `lg` | `LearnPage.jsx:111, 1396-1401, 1448`; `web/src/ResizableSidePanel.jsx:20-49` |
| Its content is `<h2>Table of contents</h2>`: add Section / Sub-section / Sub-sub-section, the tutor's outline proposal, the outline (drag, done, rename, delete) | `LearnPage.jsx:1452-1537` |
| A reader (repository source, Wikipedia, paper, PDF) opens below the outline | `LearnPage.jsx:1544-1546` |
| Canvas chat is the composer docked under the canvas and its floating chat sheet | `LearnPage.jsx:1415`; `AdaptiveCanvas.jsx:3634`; `ask.jsx:855-857` |

"Learn agent chat", reconciled:
- It is the stale `aria-label` at `LearnPage.jsx:1448`.
- The `AskPanel headerTitle="Learn Agent"` branch (`:1547`) renders only when `courseView` is set or
  `learningView !== 'lesson'`. Nothing on main reaches that:
  - every `setLearningView` sets `'lesson'` (`:982, 1006, 1030, 1032, 1042`), apart from `changeLearningView` (`:1054-1059`);
  - its callers pass `'lesson'` (`:1070, 1121, 1444`);
  - `openFromOutline` is only called with `'lesson'` (`:1557`).

### Pages, menus, keys

| Fact | Source |
|---|---|
| `/b/<token>` and `/e/<token>` render `SharedBoardPage`: read-only canvas, View-only pill, Start Rabbit Hole, Fork; no right panel | `web/src/main.jsx:94-105`; `web/src/SharedBoardPage.jsx:86-106` |
| `HandleGate` wraps every Rabbit Hole page, `/b` and `/e` included; it fails open when the profile service is unavailable | `web/src/main.jsx:102-108`; `web/src/HandleGate.jsx:7-10` |
| Right-click menu rows: Start Rabbit Hole; Ask about this; typed rows; Duplicate; Zoom to selection; Group, Ungroup, Rename group; Select all; Delete. Rows that need a selection are disabled off a card. A view-only board shows only Start Rabbit Hole, and no menu off a card | `AdaptiveCanvas.jsx:3167-3183, 3447-3470` |
| No single-letter tool shortcuts (only `L` while presenting); the page owns `/` and `?` | `AdaptiveCanvas.jsx:2076`; `LearnPage.jsx:135-146` |
| `MessageCircle` means "Ask in chat"; comments use `MessageSquareText` | `AdaptiveCanvas.jsx:312, 701, 3381` |

### Identity

| Fact | Source |
|---|---|
| `users.id` (32 hex) is the stable account id. The principal email is real for email sign-in and synthetic (`user@<id>.rabbithole.invalid`) for Google/GitHub. Provider emails are "never lookup keys or principals" | `control-plane/src/auth.js:75-76`; `control-plane/migrations/0026-users.sql:1-4, 12-13` |
| Learn routes get `{email, org, orgName, userId}` from `/api/me` | `control-plane/src/repositories.js:41-46`; `control-plane/src/dev-forwarding.js:41-56` |
| Handles, names and avatars by reference; `/api/learn/creators/<handle>/avatar` | `control-plane/src/canvases.js:49-50`; `control-plane/src/creators.js:47-51` |
| `apiFetch` sends any 401 to `/login` | `web/src/api.js:74-76` |

### Sharing, boards, forks

| Fact | Source |
|---|---|
| `canvases` is UNIQUE(org, name); `ownedCanvas` looks it up in the viewer's org; `canvasApp` hard-codes `members: []` | `repository-schema.sql:27-32`; `canvases.js:14-19, 68-73` |
| One `learn_boards` row per (org, owner, app, board): `state_json` and an integer `version` (stale PUT → 409); a changed `state_json` bumps `updated_at` | `learn-boards.js:94-110` |
| Non-owners get in only by token (`sharedRow`, `sharedAccess`), always view-only; Trash suspends both | `learn-boards.js:161-198` |
| Fork and Duplicate copy `state_json` into a new board row (new UUID), keeping block ids | `learn-boards.js:296-321` |

### Membership and email

| Fact | Source |
|---|---|
| No canvas membership, invitation or accept flow exists | `control-plane/learn-migrations/0001…0010` |
| The one sender, `sendEmail` (Resend, plain text), is in the control plane; the app Worker has no mail key by policy | `control-plane/src/index.js:42-56`; `web/wrangler.rabbit-hole-prod.jsonc:47` |
| Production sender `Rabbit Hole <signin@digrabbithole.com>`; dev has no Resend key | `control-plane/wrangler.rabbit-hole-prod.jsonc:29, 36`; `wrangler.rabbit-hole-dev.jsonc:32-36` |
| Dev/review Workers block control-plane POSTs outside an allow-list | `dev-forwarding.js:66-79` |
| Email-code precedent: CLI login codes with per-address and per-domain limits. Test mode echoes links and codes only with `SMALL_ENV=test` plus the bypass secret | `index.js:195-208`; `auth.js:22, 374, 385` |
| Atomic counted-insert rate limits | `control-plane/src/learn-shared-ask.js:130-160` |

### Cards, coordinates, sync

| Fact | Source |
|---|---|
| Stable `crypto.randomUUID()` ids for cards, items, shapes, links, groups | `AdaptiveCanvas.jsx:1564, 1593, 1598, 1782` |
| Cards: a flex column plus `dx, dy`; world boxes in `bounds[id]`; free items store world `x, y` | `AdaptiveCanvas.jsx:212, 1871-1878, 3243` |
| An asked-about area rides on a card and falls back to its own point | `AdaptiveCanvas.jsx:1349, 2584-2589` |
| Card delete has no tombstone; undo restores the same id | `AdaptiveCanvas.jsx:1969-2021` |
| No live sync of any kind | `SharedBoardPage.jsx:61-70`; `LearnPage.jsx:664-701` |

**Missing:** comments, user mentions, Rabbit Hole notifications and moderation. **Names to avoid:** `threads` and
`messages` (canvas chat) and `exchanges[].replies` already exist, so new tables use `canvas_comment_*`.

## 2. Identity, storage and leak rules

**Identity (HR1)**
- Every permission check keys on `users.id`: `member_user_id`, thread `created_by`, comment `author_id`, block `user_id`,
  mention `user_id`.
- Each of those rows also stores the account's principal, only so display data (name, handle, avatar) can be joined by
  reference, as elsewhere in LEARN_DB. Principals never appear in a response.

**Keys**
- A thread belongs to one board row: `board_id` = `learn_boards.id` of the canvas's main board, plus `org` and `canvas`.
- The public route family is keyed by the publication token and never accepts or returns a board id.
- The member family is keyed by the board id and needs owner or member identity.
- Top-level `canvas-*` canvases and their `main` board only (Q5).

**Audience**
- `members` threads: readable only by the owner and active members.
- `public` threads: readable by anyone who can open `/e/` while public comments are Open or Closed.
- Fixed at creation. Publishing, unpublishing, sharing or the public comments setting never moves a thread.

**Storage apart from the board.** A comment write never touches `learn_boards`: no `version` change, no `state_json` write,
no `touchCanvas` (so `updated_at` and Library order stay put), and no owner 409. Anchors and labels live in comment rows,
so undo, board snapshots, publication and forks never carry them.

**Forks and copies.** A fork or Duplicate is a new board row, so no threads are copied. Membership is per canvas and is
not copied either. `forked_from` holds no thread data. A forker is never a member of the source. Start Rabbit Hole carries
no comments.

**Lifecycle**
- **Trash:** suspends members, invitations and both route families (404 for everyone but the owner); Restore returns them.
- **Unpublish:** the public family answers 404.
- **Archive:** changes nothing for members.

**Never crosses audiences:**
- members-thread counts, unread state, previews, anchors and card titles;
- who is a member (section 5, Mentions);
- emails: no comment response carries one; the owner's People list shows the addresses the owner typed, to the owner only;
- comment data in Explore, creator profiles, search or fork counts.

## 3. Roles and permissions

**One policy, two route families.**
- Every comment action goes through one server function: `can(actor, action, thread_audience, public_mode, blocked)`.
  `actor` is resolved by `users.id`.
- The member family (`/api/learn/c/:boardId/…`) and the public family (`/api/learn/boards/shared/:token/comments/…`) both
  call it.
- A public-thread action is therefore restricted identically whichever route carries it. For example, a blocked member
  posting a public reply through the member family is refused exactly as through the public family.

**Who is who** (resolved per request; a person can hold several facts at once):

| Fact | Defined by |
|---|---|
| Owner | `canvases.owner_email` principal, matched through `users.id` |
| Member | an active `canvas_members` row whose `member_user_id` is the actor |
| Blocked | a `canvas_comment_blocks` row for the actor's `users.id` on this canvas. It affects **public threads only**; it never changes membership |
| Signed in | a session; any account, handle or not (Q18) |

### Members-only threads

Readable only by the owner and active members. The public setting and blocks never apply here.

| Action | Owner | Member (blocked or not) | Anyone else |
|---|---|---|---|
| Read, mark read | yes | yes | no (404) |
| Start a thread, reply | yes | yes | no |
| Edit own | yes | yes | no |
| Delete own | yes | yes | no |
| Delete others' | yes | no | no |
| Resolve / reopen | any thread | threads they started (Q8) | no |

### Public threads

Exist only on a published canvas.

| Action | Owner | Signed-in, not blocked (member or not) | Signed-in, blocked (member or not) | Signed out |
|---|---|---|---|---|
| Read (Open or Closed) | yes | yes | yes | yes (Q3) |
| Read (Off) | yes, marked "Hidden from the published page" | members: yes, marked; others: no | members: yes, marked; others: no | no |
| Mark read | yes | when they can read | when they can read | no (nothing is tracked) |
| Start a thread, reply | Open only | Open only | **no** | no ("Sign in to comment") |
| Edit own | Open only | Open only | no | no |
| Delete own | always | always while they can read (Q23) | always while they can read (Q23) | no |
| Delete others' | yes | no | no | no |
| Resolve / reopen | Open or Closed | threads they started, Open only | no | no |
| Block / unblock | yes | no | no | no |

**Rules**
- **Allow comments off** overrides everything below it. For every actor except the owner, `can()` refuses start, reply, edit
  and resolve on both audiences, through both route families. Read, mark read and delete-own (Q23) still follow the tables.
- **Reading, marking read and posting are separate permissions.** Closed and blocked keep reading and marking read; they
  remove starting, replying, editing and resolving (owner excepted for resolve).
- **A member who is blocked from public commenting stays a member.** They keep full members-thread rights. Only public-thread
  posting, editing and resolving stop. Removing membership is a separate owner action (below).
- **On `/b/`** the role comes from the signed-in identity, never the token. Owners and members get the members panel; other
  link viewers get today's page unchanged (Q4).
- **Editing the canvas** stays owner-only. No comment route writes `state_json`.
- **Handles:** commenting adds no step, because HandleGate already makes every signed-in account choose a handle. Moderation
  never needs one. Blocks key on the author's account id, which every comment row stores (`author_id`), so an author
  without a handle (Q18) can still be blocked.

### Removing a member vs blocking a commenter

| | Remove member (private membership) | Block commenter (public commenting) |
|---|---|---|
| Who | someone invited by email | the author of a public comment, keyed by their account id (handle not needed) |
| Where | Share → People with access → ⋯ → Remove access | a public comment's ⋯ → Block from commenting (the server reads that comment's `author_id`); Unblock in Share → Blocked |
| Private access afterwards | removed: no `/c/` page and no members-only threads | unchanged: a blocked member stays a member with full members-thread rights |
| Viewing afterwards | public or valid share-link viewing may remain (`/e/` if published, a `/b/` link they still hold) | can still view the public canvas |
| Members threads | no longer readable, including their own | unaffected (readable only if they are a member) |
| Public threads | unaffected | readable; cannot start, reply, edit or resolve; can delete their own (Q23) |
| Their comments | stay, attributed; the owner can remove any (Q10) | stay unless the owner ticks "Also remove their comments" (Q9) |
| Undo | a new invitation, verified again | Unblock |
| What they see | On `/c/`: "You're no longer a member of this canvas." | "You can't comment publicly on this canvas." |

## 4. Comment settings: Allow comments, and the public setting (Q20, Q24, Q25)

**Allow comments** (owner requirement) is one toggle in Share, labelled exactly "Allow comments".
- **On:** members can comment, and the public setting below applies to the published page.
- **Off:** only the owner can start, reply, edit or resolve, on members-only and public threads alike. Everyone else keeps
  what they can read and can mark read, and can still delete their own comments (Q23). Members see "Comments are turned off
  for this canvas" in place of the composer, and no Add comment entry points. The public setting is shown disabled.
- **Existing comments** stay visible read-only (Q25, recommendation).
- **Default:** On (Q24, recommendation).
- **Stored as** `canvas_comment_settings.comments_enabled` (1 or 0; no row means 1).

Then, under Share → Published to Explore, **Public comments** is one choice of three, each stating what happens to existing comments:

| Setting | Copy in Share | Published page | Owner and members |
|---|---|---|---|
| Off (default) | "The published page shows no comments." | No Comments button, pins or threads | See public threads marked "Hidden from the published page" |
| Open | "Anyone signed in to Rabbit Hole can comment." | Read and post | Read and post |
| Closed | "Existing comments stay visible. No new comments or replies." | Read only; "Comments are closed." | Read; only the owner resolves |

Stored as `canvas_comment_settings.public_mode`: `off` | `open` | `closed`. No row means `off`.

## 5. Experience (Figma board numbers in brackets)

### One panel, two views [1, 2]

- The panel header becomes two underline tabs: **Table of contents** and **Comments**, with an unread count on Comments.
- Table of contents is today's panel unchanged. Opening a reader or clicking a heading selects it.
- Comments shows the list, one thread, or a new-thread draft. It is opened by:
  - Add comment (menu, tool or `C`);
  - selecting a pin;
  - a `?thread=` link;
  - the header **Comments** button (unread dot) beside Share.
- The panel toggle stays and reopens the last view used in this visit.
- Phones: a bottom sheet with the same two views [17].

### Audience, always shown [2, 3, 4, 8, 9]

- Every thread row and every thread header carries **Members only** (people icon) or **Public** (globe icon).
- When the canvas has a public thread, an audience filter (All · Members only · Public) appears beside the separate status
  control (Open ▾).
- **Before posting a new thread, a "Visible to" row:**
  - Owners and members choose Members only (default) or Public. Public is offered only while public comments are Open (Q19).
  - It is fixed to Public on `/e/`.
  - It is fixed to Members only on `/c/` and `/b/` when the canvas is not published.
- **Before replying:** "Replying in Members only" or "Replying in Public". A reply keeps its thread's audience.

### Thread list and thread [2, 3, 9]

- **Rows:** avatar, name (else @handle), time, the audience label, the anchor ("on Card B: bulges", "on the canvas",
  "Card deleted · [title]"), the first line, the reply count and an unread dot. 30 per page.
- **Thread header:** Back to all comments, the audience label, the anchor (click to pan to the pin), Resolve / Reopen
  (section 3), and ⋯ (Copy link).
- **Messages:** flat, oldest first; avatar, name, @handle, time, "edited"; text with mention chips and plain links. Earlier
  replies load 50 at a time.
- **Own message ⋯:** Edit, Copy link, Delete. **The owner's ⋯ on others':** Remove comment, plus Block @handle on a public
  comment. Deleted messages leave "This comment was deleted" or "Removed by the owner".
- **Composer:** the existing `ChatComposer` (Enter sends, Shift+Enter is a new line); 5,000 characters with a counter from
  4,500; `@` for mentions. Plain text only (line breaks, `https://` links, mention chips), built as React elements.

### Starting a thread [4, 5]

| Entry | Result |
|---|---|
| Right-click a card, artifact or drawn shape | Start Rabbit Hole (first, unchanged), **Add comment** (hint `C`), then today's rows unchanged. The pin goes where the right-click was, on that object |
| Right-click a group's outline or its name chip (owner, 2026-10-08) | **Add comment** on the group: the pin follows the group. A right-click on a member comments on that member |
| Right-click the empty canvas | No comment row (owner, 2026-10-08: comments go on a selected card, shape or group); today's rows as before |
| View-only page with comment rights | Card: Start Rabbit Hole, Add comment; a shape or group: Add comment. Empty canvas: no menu |
| Toolbar | No Comment tool (owner, 2026-10-08), on owned and view-only boards |
| Keyboard | With a selection (owner, 2026-10-08), `C` comments on it: a card, a shape or text, a whole group, or the first of several selected objects. With nothing selected, `C` does nothing. Shift+F10 or the menu key opens the menu. Esc cancels |
| Touch | Select the object, then a long-press opens the menu where the browser fires `contextmenu` |

**`C` guards (Q14).** `C` does nothing:
- while typing in an input, textarea, `contenteditable` or the composer;
- inside an embedded editor or widget: notebook, code card, whiteboard, Explain Back sketch, iframe, or any element that
  stops key events itself (the canvas's existing typing test);
- with Ctrl, Alt or Meta held (Ctrl+C still copies);
- while presenting.

Choosing Add comment shows a ghost pin and opens Comments on a draft with its "Visible to" row. Nothing is saved before
Send; Esc or × removes the ghost.

### Pins

**Placement (owner, 2026-10-08):** an object's pins sit in a fixed slot just left of where its Ask in chat pill sits, above
its top right and on the pill's row - with the extra pills a few cards add beside it reserved (a whiteboard's or paper's Ask
selection; a chat card's Explain in canvas and Continue convo) - whether the object is selected or not, so a pin never
covers a pill. Several threads line up leftwards, oldest nearest the pill. A dropped image, a text box and a sticky note
have the same Ask in chat (r35, [canvas-card-selection.md](canvas-card-selection.md)); a shape keeps the slot it would
take. The stored offset is not used for them (render only, no migration). A pin on a bare canvas point - from before this
change - stays where it was placed; no new ones are made.

A speech-bubble pin at a constant screen size showing its thread's live message count (owner, 2026-10-08): the starter
plus replies, deleted ones excluded, `99+` above 99; accessible name "N comments". Only the new-comment draft shows a +.
- **Look:** filled with its colour and outlined solid in it; orange (the canvas palette's `#f59e0b`) unless recoloured.
  The count and the + use the `white` token: white in light mode, the dark surface in dark mode.
- **Unread:** accent ring. **Open in the panel:** an ink ring. **Picked:** the selection ring.
- **Resolved:** shown only under Resolved or All.
- View → Show comments toggles all pins; pins hide while presenting.
- **A pin is a canvas object (owner, 2026-10-08).** A click picks it (the selection ring and the keyboard focus, never the
  board selection) and opens its thread in the Comments panel, which leaves the focus on the pin. A press on the canvas or
  Esc lets it go.
  - **Colour:** a picked pin shows the shapes' colour control with only its six swatches, for whoever may resolve the thread.
    Stored per thread (`canvas_comment_colors`, learn 0014), visible to everyone who sees the pin; the board is never written.
  - **Del or Backspace:** deletes the whole thread, permanently (messages, mentions, read marks, colour; no undo). The
    canvas owner always may; the starter only while every live message in it is theirs. A thread with replies asks first,
    by the pin: "Delete the thread and its N replies?" [Cancel] [Delete]. A refusal shows the server's line by the pin.
    The keys keep C's guards: typing in an input, the composer or a dialog never reaches them.

### Mentions [3, 8]

| Thread | Suggested | Never suggested |
|---|---|---|
| Members only | the owner and active members | pending invitees, removed members, anyone else |
| Public | the owner and **public participants**: accounts that have posted in a public thread of this canvas | a member who has not posted publicly, pending invitees, blocked users |

- **Before a thread exists**, suggestions are looked up by audience, not by thread: the new-thread draft asks for the
  audience chosen in "Visible to" (section 10, `people`). Replies ask by thread, and the server derives the audience from it.
- A typed @handle outside the set stays plain text and notifies nobody; the server re-checks the set on every post.
- A suggestion shows avatar, name and @handle, never an email.
- Mentions are stored by reference, so a handle change shows the new handle.
- A mention never adds, invites or reveals anyone.

### Unread indicators [2, 12, 13]

- **Tracked for** the owner, members and participants (posted in the thread or were mentioned in it). A thread is unread
  when someone else posted after my last read.
- **Shown on:** the pin, the row, the Comments tab count, the header button, and Library and Home cards ("2 new comments",
  owned and Shared with you).
- **Freshness (Q16):**
  - The open panel refetches every 30 s while the tab is visible, and on focus.
  - The header count and the Library fetch `GET /api/learn/comments/unread` on load, on visibility or focus, and every 60 s
    while visible; polling pauses while hidden.
  - Returning from a canvas remounts the Library, so a thread read there clears its line.
  - My own actions update the view immediately, then refetch.
- **Deferred:** the global inbox and email notifications (Q7).

### Failed and offline sends: explicit Retry [11e]

- A failed or offline post stays in the composer as a draft, kept in session storage for that thread.
- The draft shows "Couldn't send." with **Discard** and **Retry**. While a draft has failed, the composer's own send button
  is disabled, so Retry is the one send control.
- Nothing is sent on reconnection by itself. Offline reads: "You're offline. Your reply is saved here. Press Retry when
  you're back."
- Retry re-runs the request, so the server re-checks access, block, setting and limits. If access is gone, the draft stays
  visible to copy.
- **No duplicates:** each post carries a client-made id, and creating a thread or comment is idempotent on it. A retry of a
  post that actually landed returns the existing row (200).

### Share → People with access (owner) [6]

- **You (owner).**
- **Each member:** avatar, name, @handle, a shield icon with "verified [invited address]" (owner-only), the fixed role
  "View and comment", and ⋯ → Remove access.
- **Pending:** the invited address with "Invited · expires Oct 21" and ⋯ → Resend invitation, Cancel invitation. After a
  failed send: **"Email wasn't sent · Resend"** (HR3). No link is ever shown or copyable (HR2).
- **Add people by email** + Invite, with: "They can view and comment. They can't edit. They'll confirm this email address
  before joining."
- **Under the view link:** "Link viewers don't see comments. Members see theirs wherever they open the canvas."
- An **Allow comments** toggle, labelled exactly "Allow comments" (section 4).
- **Under Published to Explore:** Public comments Off / Open / Closed (section 4), disabled while Allow comments is off.
- **Blocked from commenting:** each person with Unblock.

### Pages [7, 8, 9]

- **`/c/<board id>` (member):** the `SharedBoardPage` shell with "View and comment", "Shared with you by [name] · @handle",
  the Comments button, Start Rabbit Hole, Fork, and the Comments panel. No Table of contents: view-only pages have none
  today. The board id is used because canvas names are unique only per org. The owner opening `/c/` is sent to their own
  page.
- **`/e/<token>`:** "View only" and "Published by …"; Comments follows the public setting; signed out it is read-only with
  "Sign in to comment".
- **`/b/<token>`:** the owner and members get the members panel; other link viewers get today's page.
- **Thread links:** `/c/<board id>?thread=<id>` (members) and `/e/<token>?thread=<id>` (public). With no access: "This
  canvas isn't available to you".
- **Library → Shared with you [13]:** canvases where you are an active member, with owner, role, unread and "Updated …".

## 6. Recipient-only invitations (Q1, HR1-HR5)

**Goal:** only the person who controls the invited address can accept. Access binds to the accepting account's `users.id`.
Account lookup and linking do not change:
- the invited address is never added to an account;
- it is never used to find one;
- provider emails are never compared with it.

**Every acceptance confirms the address with a fresh code**, including when the signed-in account's own email is the
invited address. Revision 3's shortcut for that case is removed: one flow, and proof of control at the moment of joining.

### Screens [10, 10b, 14, 15]

| # | Screen | Copy and actions |
|---|---|---|
| a | Invitation, signed out | "Ada Lovelace (@ada) invited you to view and comment on **Why attention scales**", "Sent to b•••@lab.org", **Sign in to continue**, "Use any sign-in method. You'll confirm this email address next." |
| b | **The account receiving access** | "Who gets access": the signed-in account (avatar, "Bob Kim · @bob", "Signed in with Google"); "Ada's invitation was sent to b•••@lab.org. We'll email a code there to confirm it's yours."; **Send code to b•••@lab.org**; "Not you? Switch account"; Cancel |
| c | **A fresh code was sent** | "We sent a new 6-digit code to b•••@lab.org. Earlier codes no longer work."; six boxes; "Joining as Bob Kim · @bob · expires in 10 minutes"; **Confirm and join**; "Resend code in 0:42" (mirrors the server's `retry_after`); Cancel |
| d | **Incorrect code** | Red boxes; "That code isn't right. 4 tries left."; Resend code; Cancel. After 5 wrong tries this code is spent: "Too many tries. Send a new code." |
| e | **Expired code** | "This code has expired. Codes last 10 minutes."; **Send a new code**; Cancel |
| f | **Invitation no longer valid** (owner cancelled, expired, a newer invitation was sent, or canvas in Trash) | "This invitation is no longer valid. Ada cancelled it, it expired, or a newer one was sent. Ask Ada for a new invitation."; Go to Rabbit Hole |
| f′ | **Invitation locked** (20 wrong codes across this invitation, C3) | "Too many wrong codes for this invitation. Ask Ada to resend it."; Go to Rabbit Hole |
| g | **Already a member** | "You already have access. Bob Kim · @bob can already view and comment on Why attention scales."; Open canvas. No code is sent |
| h | **Joined** | "You've joined Why attention scales. Bob Kim · @bob can now view the canvas and comment on it. You can't edit it."; Open canvas |
| i | **The owner opened their own invitation** (`owner_self`) | "This is your canvas. Invitations are for the people you invite."; Open canvas |
| j | **Token missing** (a new tab, or sign-in finished in another browser) | "Open the invitation link from your email again."; Go to Rabbit Hole |
| k | **Too many codes** / **code not sent** | "Too many codes requested. Try again in 3 hours." / "We couldn't send the code. Try again in 1 minute." The wait is the server's `retry_after`, rendered; never a fixed duration (C5) |

- **Allow comments off:** the invitation email and the `/i` screens say "view" instead of "view and comment". The server picks
  that second fixed wording from the canvas setting when it sends or renders, so C6 holds. A member who joined while comments
  were on keeps the membership, and cannot post while the switch is off.
- **Cancel** (b-e) leaves without accepting. It ends this account's open code; the invitation stays pending.
- The invited address is always masked (`b•••@lab.org`). The invitation page never shows a full email.
- **Emails [14, 15]** are fixed plain-text templates (C6):
  - **Invitation:** subject "[inviter] invited you to comment on '[title]'". The body has the `/i#<token>` link and nothing
    else secret, and ends "Replies to this email aren't read."
  - **Code:** subject "Your Rabbit Hole invitation code" (the code is never in the subject). The body has the code, plus
    "Someone signed in to Rabbit Hole as Bob Kim (@bob) asked to accept Ada Lovelace's invitation to 'Why attention
    scales'.", and ends "Replies to this email aren't read."
  - **Interpolated values only:** the title in quotes (at most 120 characters, control characters stripped); the inviter's
    name or @handle, else "a Rabbit Hole user"; the accepting account's name and @handle, else its provider label. Never a
    principal, a provider email, or any address but the recipient's own.

### Acceptance contract (Home corrections C1-C7 applied, HR5)

**H7: SIGNED by Home, 2026-10-07**, against revision 5 (sections 6, 7, 9, 10 and 13; C1-C7 as written). Home's optional
hardening is adopted: the activation UPDATE also requires `failed_attempts < 20`. Not part of the sign-off: the H3 pre-launch
items (release-readiness list) and the real migration file, which Home reviews once it exists. No production change and no
real email send is authorized.

**Service boundary (C4, H1)**
- The **control plane** serves the whole invitation family **and the whole `members` subtree**: `GET`/`POST …/members`,
  `POST …/members/:id/resend` and `DELETE …/members/:id`. It holds `MASTER_KEY` (code HMAC) and the mail key, and one module
  owns every write to invitation state.
- Both control planes already bind LEARN_DB (`rabbit-hole-cp` → `rabbit-hole-learn-prod`, `rabbit-hole-cp-dev` →
  `rabbit-hole-learn-dev`). No new binding, secret or resource.
- The routes are mounted before the generic `/api/*` user resolution in `index.js`, with these guards:
  - **session only**, through `sessionOf`, with `uid` required; never `cliAuth`;
  - POSTs refused unless `Origin` equals `env.PUBLIC_ORIGIN` (or the request's own origin when it is unset), as in
    `handleWebAuth`;
  - owner identity: the session principal equals `canvases.owner_email`.
- `sendEmail` stays module-private. A narrow `sendInviteEmail(env, kind, to, fields)` is exported, or `sendEmail` moves to
  a small module imported only by `index.js` and `canvas-members.js`. A client-supplied recipient or text never reaches it.
- **Forwarding:**
  - Production needs no new forwarding code: `dev-worker.js` ends with `forwardToProduction`, and `app-worker.js` wraps
    every request in `ownControlPlane`.
  - The app Worker's `/api/learn/c/` router returns null (falls through) for `^/api/learn/c/[^/]+/members(?:/.*)?$`, and
    never matches `/api/learn/invites/`.
  - A unit test proves both families reach the control plane in production and are refused on a guarded binding.

**Tokens never in a URL (C2)**
- **Email link:** `<PUBLIC_ORIGIN>/i#<token>`. A fragment is never sent to a server, logged, or sent as a Referer. The link
  is built from `env.PUBLIC_ORIGIN`, never the request host.
- **The `/i` page:**
  - On load it reads `location.hash`, stores the token in `sessionStorage` (`rh_invite`) and runs
    `history.replaceState(null, '', '/i')`.
  - The token never goes to `localStorage`, cookies, analytics or error reports.
  - It is cleared on joined, on `invite_invalid` and on Cancel.
- **Sign-in:** `/sign-in?next=/i`, exactly. The token never enters `next`, `login_links`, the OAuth flow cookie or any
  redirect. Back on `/i`, the page reads `sessionStorage`. With no token there, the page shows screen j.
- **Headers:** the `/i` shell is served with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. Every invitation
  API response carries `Cache-Control: no-store`.
- **Test-only echoes (H4):**
  - Gated by the existing `echoesLogin(env)` (`SMALL_ENV === 'test'` plus `TEST_BYPASS_SECRET`); no second predicate and
    no build flag.
  - The fields are `test_code` and `test_invite_url`.
  - Tests assert both are absent with `SMALL_ENV` unset, set to `dev`, or set to `test` without the secret.

**Routes (token in the body, POST only)**

| Request | Who | Success | Errors (`code`) |
|---|---|---|---|
| `POST /api/learn/invites/preview {token}` | anyone (read-only, consumes nothing) | `{state, title, inviter: {name, handle}, masked_email, signed_in, account?: {name, handle, provider_label}, already_member, owner_self}` | 404 `invite_invalid`, the same for unknown, used, cancelled, expired, superseded and Trash (screen f); `state: 'locked'` (screen f′) |
| `POST /api/learn/invites/code {token}` | session with `uid` | `{sent: true, masked_email, expires_in: 600, retry_after: 60}`. Ends this account's earlier open codes for this invitation only; other accounts' codes stay | 401 `sign_in`; 403 `owner_self`; 404 `invite_invalid`; 409 `already_member` (nothing sent); 429 `too_many_tries` (invitation locked); 429 `too_many_codes` / `limited` `{retry_after}`; 503 `email_unavailable` `{retry_after}` |
| `POST /api/learn/invites/accept {token, code}` | session with `uid` | `{joined: true, url: '/c/<board id>'}`; a repeat by the same account returns the same 200 | 401 `sign_in`; 403 `owner_self`; 404 `invite_invalid`; 409 `already_member` `{url}`; 409 `code_needed` (no open code for this account); 422 `code_wrong` `{tries_left}`; 410 `code_expired`; 429 `too_many_tries` |
| `POST /api/learn/invites/cancel {token}` | session with `uid` | `{cancelled: true}`: ends this account's open code | 404 `invite_invalid` |

`code_other_account` is dropped, replaced by `code_needed`. Owner-side Resend adds 409 `already_joined`.

**Codes (C3)**
- Generated with `crypto.getRandomValues`: a uniform `Uint32`, draws at or above `4294000000` rejected, then mod 10^6,
  zero-padded.
- Stored as `code_hmac = hmacHex(env.MASTER_KEY, id + ':' + user_id + ':' + code)` (`token.js`), compared in constant time.
- Bound to (invitation, `user_id`): 10 minutes, 5 tries, single use.
- **Invitation-wide lock:** `canvas_members.failed_attempts` counts wrong codes from every account. At 20, the code route
  answers 429 `too_many_tries` and preview answers `state: 'locked'` (screen f′) until the owner Resends, which resets it.

**Send code, in order:**
1. Session with `uid`.
2. Load the invitation by `sha256(token)`: `status = 'pending'`, `expires_at > now`, canvas not in Trash.
3. Refuse the owner (`owner_self`).
4. Refuse an existing member (`already_member`; nothing sent).
5. `failed_attempts < 20`.
6. The C1 conditional INSERT into `canvas_invite_sends`.
7. One batch: end this account's open codes for the invitation, and insert the new code.
8. Send. On failure: end the new code, set the send row's `delivered = 0`, and answer 503 `email_unavailable {retry_after}`.

**Accept, in order** (steps 1-4 as above; already-member is checked again at activation):
- **a. Claim an attempt:**
  ```sql
  UPDATE canvas_invite_codes SET attempts = attempts + 1
   WHERE invitation_id = ?inv AND user_id = ?uid AND ended_at IS NULL AND expires_at > ?now AND attempts < 5
     AND (SELECT failed_attempts FROM canvas_members WHERE id = ?inv) < 20
   RETURNING id, code_hmac, attempts;
  ```
  The lock is read inside the claim (Home's H7 code review, 2026-10-07), so concurrent wrong guesses cannot pass 20.
  If no row comes back, one diagnostic SELECT picks the answer:
  - no code row for this account: 409 `code_needed`;
  - the newest code expired: 410 `code_expired`;
  - the newest code exhausted: 429 `too_many_tries`.
- **b. Wrong code:**
  - `UPDATE canvas_members SET failed_attempts = failed_attempts + 1 WHERE id = ?inv`.
  - At `attempts = 5`, end the code and answer 429 `too_many_tries`; otherwise 422 `code_wrong {tries_left: 5 - attempts}`.
- **c. Right code: one D1 batch (one transaction):**
  ```sql
  UPDATE canvas_members
     SET status = 'active', member_user_id = ?uid, member_email = ?principal, accepted_at = ?now
   WHERE id = ?inv AND status = 'pending' AND token_hash = ?hash AND expires_at > ?now AND failed_attempts < 20
     AND EXISTS (SELECT 1 FROM canvas_invite_codes WHERE id = ?code AND ended_at IS NULL);
  UPDATE canvas_invite_codes SET ended_at = ?now WHERE invitation_id = ?inv AND ended_at IS NULL;
  ```
  - Activation keeps `token_hash` (Home's review): status, not the hash, ends the link for everyone else, and the same
    account repeating an accept or opening the link again (a lost 200, a second tab) is found by the hash beside
    `status = 'active' AND member_user_id = ?uid` and gets the same 200 (preview: `already_member`). Remove and Cancel still
    set it to NULL.
  - The first statement changed 1 row: 200 `{joined, url}`.
  - It changed 0 rows: re-read the row.
    - Active with `member_user_id = ?uid` (a double submit or a second tab): the same 200, which is idempotent.
    - Anything else (cancelled, resent, expired, or accepted by another account): 404 `invite_invalid`.
  - The batch throws on the `canvas_members_person` unique index (this account is already active through another
    invitation to a different address): the whole batch rolls back, this account's code is ended on its own, and the answer
    is 409 `already_member {url}`. The other invitation stays pending for the owner.

**Edge cases**
- **Concurrent accept or replay:** exactly one transaction can win. Every other attempt ends at 404 `invite_invalid`, or at
  the idempotent 200 for the same account.
- **Owner Resend while the recipient verifies.** One batch:
  ```sql
  UPDATE canvas_members SET token_hash = ?new, expires_at = ?, failed_attempts = 0, email_status = 'failed'
   WHERE id = ? AND status = 'pending';
  UPDATE canvas_invite_codes SET ended_at = ?now WHERE invitation_id = ? AND ended_at IS NULL;
  ```
  Then it sends, and sets `email_status = 'sent'` on success.
  - If the accept committed first, Resend changes 0 rows: 409 `already_joined`, and the owner's list refreshes.
  - If the Resend committed first, accept fails: 404 `invite_invalid` (screen f).
- **Owner Cancel or Remove:** `status = 'cancelled'` or `'removed'`, `token_hash = NULL`, every open code ended, in one batch.
- **Trash:** checked at preview, code and accept. A Trash that lands in the gap only activates a membership that Trash
  already suspends, which is harmless.
- **Switching account mid-flow:**
  - Every screen re-reads the account from the live session.
  - An accept from an account without an open code gets `code_needed`.
  - "Switch account" is `/logout` (an epoch bump), then `/sign-in?next=/i`; the token survives in `sessionStorage`.
- **Missing `uid`:** 401 `sign_in`; nothing written or sent.
- **Creating an invitation:**
  1. Insert the row with `status = 'pending'` and `email_status = 'failed'`.
  2. Send.
  3. Set `email_status = 'sent'`.

  A Worker that dies in between leaves "Email wasn't sent · Resend", which is truthful.

**Email limits (C1, C5)**
- **Normalize first.** Every invited address goes through the exported `loginEmail()` (`auth.js`): trimmed and lowercased;
  one `@`; at most 254 characters; `.invalid`, quoted and display-name forms refused. The result is stored as
  `invited_email`, and it is the only address ever emailed. **Delivery uses the actual invited address**: only trimming and
  lowercasing; a `+tag` is kept, so `b+canvas@lab.org` is emailed at `b+canvas@lab.org`. Alias folding exists only in `cap_key`,
  for rate-limit accounting. A refused address is skipped with `reason: 'invalid_email'`.
- **Cap key:** the normalized address with any `+tag` removed from the local part, used only for counting. `ponytail:`
  Gmail dot-aliasing is not folded; fold it if abuse shows up.
- **Every email attempt consumes one unit of each applicable cap,** whether it is an invitation created (one per address),
  an owner Resend or a code send:
  - the unit is consumed when the attempt is handed to Resend, and stays consumed if delivery fails;
  - a refused request consumes and sends nothing.
- **Each check-and-consume is one conditional INSERT** covering every applicable window (the `emailLogin` pattern):
  `INSERT INTO canvas_invite_sends (...) SELECT ... WHERE (SELECT COUNT(*) ...) < ? AND ...`. If `changes = 0`, the
  request is refused. The limits are in section 9.
- **No leak:** owner caps and recipient caps answer with the same code `limited` (and `reason: 'limited'`), so an owner
  cannot tell that someone else has been emailing an address.
- **`retry_after`** (integer seconds, at least 1):
  - For each violated window: the oldest counting row's `sent_at`, plus the window, minus now. The largest of these is
    returned, so a daily cap can mean hours.
  - Sent in the body and as `Retry-After`. The UI renders it; copy never hard-codes a duration.
- **The 60 s gap between codes is a server rule** (429 `too_many_codes {retry_after}`); the client countdown only mirrors it.
- **Failed code send:** 503 `email_unavailable {retry_after}`, where `retry_after` is the larger of 60 and any cap the
  consumed unit now hits. The code row is ended. Copy: "We couldn't send the code. Try again in …". With no mail service
  the answer is the same 503; invitations are then created with `email_status = 'failed'`; a test instance echoes instead.
- **Owner invite with several addresses:** each address is independent. The answer is always 200
  `{invited: [{id, email_status}], skipped: [{email, reason, retry_after?}]}`:
  - `reason` is one of `invalid_email`, `already_member`, `already_invited`, `limited`, `members_full`;
  - a send failure is listed under `invited` with `email_status: 'failed'`;
  - 429 `limited {retry_after}` only when the owner's daily cap is used up before any address is processed.
- **Owner Resend:** 200 `{email_status}` (`'failed'` shows "Email wasn't sent · Resend"), or 429 `limited {retry_after}`.
  The token rotates even when delivery fails, and the old link stays dead.
- **Resend's own rate limit** (10 requests per second): its 429 makes `sendEmail` return false, which is an ordinary failed
  delivery.

### Home dependencies (positions from Home, 2026-10-07)

| # | Item | Status |
|---|---|---|
| H1 | The control plane serves the invitation family and the whole `members` subtree; `sendEmail` stays private behind `sendInviteEmail` | **agreed** (C4) |
| H2 | A dev/review allow-list for the invitation POSTs | **rejected, not needed.** `productionAllows` is GET-only and fail-closed; one entry would weaken every dev Worker, and `rabbit-hole-cp-dev` has no Resend key and runs `SMALL_ENV=dev` (no echo), so a dev clone could never finish an acceptance. `dev-forwarding.js` is untouched. Invitation e2e runs on a local `SMALL_ENV=test` stack; owner UI states (People, "Email wasn't sent") can be shown on a dev clone through `/test/session` and seeded rows |
| H3 | Sender | **suitable:** the existing `EMAIL_FROM` `Rabbit Hole <signin@digrabbithole.com>` (domain verified with DKIM and SPF; tracking off; receiving off, hence "Replies aren't read"; 10 requests/s). **Before the first production invitation, each at an owner GO:** check the Resend plan and quota (the account is shared with apateo.ai); add DMARC `p=none` (DNS); make a first production send; rotate a full-access key to sending-only if production holds it |
| H4 | Test echo | **agreed:** `echoesLogin(env)` only, with the negative tests |
| H5 | Migration number | **none now:** no `0011` exists on any ref. Keep `00NN`; Parallel assigns the next free number at merge; Home reviews the file |
| H6 | Remote migrations and deploy | separate GO after V1 approval |
| H7 | Contract sign-off | **signed 2026-10-07** (revision 5) |

Out of scope: using a verified invitation address for sign-in or account linking.

## 7. Data: one LEARN_DB migration (number to be allocated)

The number is not chosen here (H5). No `0011` file exists on any ref (main ends at `0010-library-trash.sql`), but `0011` is
already named in docs by the creator profile-bio proposal and by creator analytics. The file stays
`00NN-canvas-comments.sql`; Parallel assigns the next free number at merge, and Home reviews the file before it is applied
anywhere. Invitation, code and send tables use **integer unix seconds** (as `login_links` does), so the window arithmetic
needs no date parsing (C1, C7).

Additive and re-runnable (`CREATE TABLE/INDEX IF NOT EXISTS` only), mirrored into `repository-schema.sql`, local only until
a deploy GO.

```sql
CREATE TABLE IF NOT EXISTS canvas_members (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL, canvas TEXT NOT NULL,
  invited_email TEXT NOT NULL,        -- normalized by loginEmail() (auth.js); the only address ever emailed; shown to the owner only
  member_user_id TEXT,                -- users.id: THE permission identity; NULL while pending
  member_email TEXT,                  -- that account's principal, only for display joins; never returned
  status TEXT NOT NULL,               -- 'pending' | 'active' | 'removed' | 'cancelled'
  token_hash TEXT UNIQUE,             -- sha256 of the current invitation token; replaced on Resend; NULL once accepted, cancelled or removed
  failed_attempts INTEGER NOT NULL DEFAULT 0,   -- wrong codes from every account; 20 locks the invitation until Resend (C3)
  email_status TEXT NOT NULL,         -- 'sent' | 'failed' (last delivery; written 'failed' first, then 'sent', C3)
  email_sent_at INTEGER,
  invited_by TEXT NOT NULL,           -- owner users.id
  invited_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,   -- unix seconds
  accepted_at INTEGER, ended_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS canvas_members_open ON canvas_members (org, canvas, invited_email) WHERE status IN ('pending', 'active');
CREATE UNIQUE INDEX IF NOT EXISTS canvas_members_person ON canvas_members (org, canvas, member_user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS canvas_members_mine ON canvas_members (member_user_id, status);

CREATE TABLE IF NOT EXISTS canvas_invite_codes (
  id TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL, user_id TEXT NOT NULL,   -- bound to the invitation and the asking account
  code_hmac TEXT NOT NULL,                              -- hmacHex(MASTER_KEY, id + ':' + user_id + ':' + code), control plane only (C3)
  sent_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  ended_at INTEGER                                      -- used, superseded, cancelled or exhausted
);
CREATE INDEX IF NOT EXISTS canvas_invite_codes_invitation ON canvas_invite_codes (invitation_id, user_id, sent_at);
CREATE INDEX IF NOT EXISTS canvas_invite_codes_user ON canvas_invite_codes (user_id, sent_at);

-- Every invitation, Resend and code email attempt; the recipient-global caps (C1). Reserved by one conditional INSERT.
CREATE TABLE IF NOT EXISTS canvas_invite_sends (
  id TEXT PRIMARY KEY,
  cap_key TEXT NOT NULL,            -- normalized recipient, +tag stripped
  kind TEXT NOT NULL,               -- 'invite' (create or resend) | 'code'
  owner_user_id TEXT,               -- set for kind 'invite'
  invitation_id TEXT NOT NULL,
  user_id TEXT,                     -- the accepting account, set for kind 'code'
  sent_at INTEGER NOT NULL,         -- unix seconds
  delivered INTEGER                 -- 1 accepted by Resend, 0 failed, NULL in flight
);
CREATE INDEX IF NOT EXISTS canvas_invite_sends_recipient ON canvas_invite_sends (cap_key, sent_at);
CREATE INDEX IF NOT EXISTS canvas_invite_sends_owner ON canvas_invite_sends (owner_user_id, sent_at);
CREATE INDEX IF NOT EXISTS canvas_invite_sends_invitation ON canvas_invite_sends (invitation_id, user_id, sent_at);
-- ponytail: canvas_invite_sends rows are never pruned; prune anything older than 2 days if the table grows.

CREATE TABLE IF NOT EXISTS canvas_comment_settings (org TEXT NOT NULL, canvas TEXT NOT NULL, comments_enabled INTEGER NOT NULL DEFAULT 1, public_mode TEXT NOT NULL DEFAULT 'off', updated_at TEXT NOT NULL, PRIMARY KEY (org, canvas));
-- Blocks key on the author's account id; display data (name, handle) is joined by reference and may be absent (Q18).
CREATE TABLE IF NOT EXISTS canvas_comment_blocks (
  id TEXT PRIMARY KEY,                -- opaque id the owner's Unblock uses; never the account id
  org TEXT NOT NULL, canvas TEXT NOT NULL,
  user_id TEXT NOT NULL, user_email TEXT NOT NULL,
  blocked_by TEXT NOT NULL, blocked_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS canvas_comment_blocks_person ON canvas_comment_blocks (org, canvas, user_id);

CREATE TABLE IF NOT EXISTS canvas_comment_threads (
  id TEXT PRIMARY KEY,                -- client-made uuid: a retried create is idempotent
  board_id TEXT NOT NULL, org TEXT NOT NULL, canvas TEXT NOT NULL,
  audience TEXT NOT NULL,             -- 'members' | 'public', fixed at creation
  anchor_json TEXT NOT NULL,          -- section 8, at most 1 KB
  created_by TEXT NOT NULL, created_by_email TEXT NOT NULL,
  create_hash TEXT NOT NULL,          -- sha256 of (created_by, board_id, audience, anchor, body, mentions): idempotency scope
  created_at TEXT NOT NULL, resolved_at TEXT, resolved_by TEXT, last_activity_at TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0   -- live and deleted messages, for the thread size limit (Q22)
);
CREATE INDEX IF NOT EXISTS canvas_comment_threads_board ON canvas_comment_threads (board_id, audience, last_activity_at);

CREATE TABLE IF NOT EXISTS canvas_comments (
  id TEXT PRIMARY KEY,                -- client-made uuid: a retried post is idempotent
  thread_id TEXT NOT NULL, author_id TEXT NOT NULL, author_email TEXT NOT NULL,
  body TEXT NOT NULL,                 -- 1-5,000 characters as typed; mention positions live in canvas_comment_mentions
  create_hash TEXT NOT NULL,          -- sha256 of (author_id, thread_id, body, mentions): idempotency scope
  created_at TEXT NOT NULL, edited_at TEXT, deleted_at TEXT, deleted_by TEXT
);
CREATE INDEX IF NOT EXISTS canvas_comments_thread ON canvas_comments (thread_id, created_at);
CREATE INDEX IF NOT EXISTS canvas_comments_author ON canvas_comments (author_id, created_at);

-- One row per accepted mention: its UTF-16 range in the body and the mentioned account. Rewritten on edit.
CREATE TABLE IF NOT EXISTS canvas_comment_mentions (comment_id TEXT NOT NULL, pos INTEGER NOT NULL, len INTEGER NOT NULL, user_id TEXT NOT NULL, user_email TEXT NOT NULL, PRIMARY KEY (comment_id, pos));
CREATE INDEX IF NOT EXISTS canvas_comment_mentions_person ON canvas_comment_mentions (user_id);
CREATE TABLE IF NOT EXISTS canvas_comment_reads (thread_id TEXT NOT NULL, user_id TEXT NOT NULL, read_at TEXT NOT NULL, PRIMARY KEY (thread_id, user_id));
```

There is no notifications table: unread is a query over threads, mentions and read marks, filtered by current access.

## 8. Anchors: artifact-linked and empty-canvas comments

- **Shapes:** `{kind: 'object', object_id, object_kind: 'block'|'exchange'|'item'|'shape'|'group', dx, dy, label}` or
  `{kind: 'point', x, y}` in world units. `label` (120 characters) is the object's title when the thread starts.
- **Moves:** the pin resolves at render time from the live board plus `dx, dy`, so it follows every move without a write.
  A group's origin is its members' top left, so its pin follows the group; ungrouping detaches it ("Group removed").
- **Delete (Q13):** a thread whose object is gone is detached: "Card deleted · [label]", no pin, still readable, repliable
  and resolvable. Undo or a restored board brings the same id and the pin back.
- **Stale page:** the server checks a new thread's `object_id` against the current `state_json`; an object deleted meanwhile
  is accepted as detached.

## 9. Limits (Q11, Q12; all configurable, the `SHARED_ASK_LIMITS` pattern)

| Limit | Default | Why |
|---|---|---|
| Message length | 5,000 characters (413 over) | owner |
| Per person, per canvas | 30 comments per 10 minutes; 300 a day | one person cannot flood a canvas |
| Per person, all canvases | 1,000 comments a day | one account cannot spam everywhere |
| Thread size | 1,000 messages per thread (Q22) | a thread stays loadable; the 1,001st answers 409 `thread_full`: "This thread is full. Start a new thread." |
| Recipient (cap key), all owners: invitations + codes | 5 per 15 min; 20 per 24 h | C1: nobody can use Rabbit Hole to mail-bomb an address |
| Recipient (cap key), all owners: invitations | 10 per 24 h | C1 |
| Owner + recipient: invitations | 3 per 24 h (a create plus two Resends) | C1 |
| Owner, all recipients: invitations (**Resends count**) | 20 per 24 h | Q11 |
| Invitation + account: codes | 1 per 60 s (server-enforced); 3 per 15 min; 10 per 24 h | C1, C5 |
| Account, all invitations: codes | 10 per 24 h | C1 |
| Canvas: active + pending members | 50 (`members_full`) | Q11 |
| Invitation expiry | 14 days | Q11 |
| Wrong codes | 5 per code; 20 per invitation, which locks it until the owner Resends | C3 |

Invitation and code windows are **rolling**, not calendar. Every email attempt consumes a unit of each applicable cap, even
if delivery fails; a refused request consumes nothing. Owner and recipient caps answer with the same `limited` code.
Each refusal carries `retry_after` (section 6).

- There is **no per-canvas total** and, in this recommendation, **no aggregate newcomer cap** (deferred, Q12). Each account
  can use up only its own allowance, never anyone else's.
- Swarms are handled by owner moderation: Block (by account id), Remove comment, Public comments Closed or Off.
- A refusal writes nothing and answers 429 `{limited: true}`.

## 10. API

Every route resolves `{role, can}` first. Mutations use the existing "Invalid origin" check. Errors are `{error, code}` with
the existing flags (`signIn`, `limited`, `needsHandle`). A canvas you cannot read is always 404. Public GETs never answer
401; signed out they answer `can.post: false`. **No response ever contains an invitation link, a principal, an account
id, or an email other than the owner's own typed addresses in People.** Authors appear as `{name, handle?, avatar_url?}`;
`handle` is absent for an author without one (Q18).

**Idempotent creates, scoped.** Thread and comment creates carry a client-made UUIDv4 `id`. The server computes
`create_hash` over (actor `users.id`, target, normalized payload). The target is `board_id` + audience + anchor for a
thread, and `thread_id` for a comment.

| The `id`… | Answer |
|---|---|
| is new | 201 with the row |
| exists with the same `create_hash` (the same author retrying the same post to the same target) | 200 with the existing row |
| exists with any other hash: another author, another canvas or thread, or a different payload | 409 `id_conflict`, with **no content**, so another user's id never returns their comment |
| is not a UUID | 400 |

**Mention mapping (create and edit).** The body is sent exactly as typed. Mentions travel beside it:

```json
{ "id": "6f1c…", "body": "Thanks @chen, can you check option B?",
  "mentions": [ { "pos": 7, "len": 5, "handle": "chen" } ] }
```

- `pos` and `len` are UTF-16 offsets into `body`. `body.substr(pos, len)` must be `@` + the handle as typed (any case).
- The server resolves each handle to an account at write time and keeps it only if that account is in the thread's
  suggestion set (section 5). Accepted mentions are stored as (`pos`, `len`, `user_id`).
- Rejected ones stay plain text: unknown handle, outside the set, or a range that does not match the text. They notify
  nobody, and the request still succeeds. The response lists which mentions were accepted.
- An **edit** sends the whole new body and its full `mentions` list. The server replaces the stored mentions; one removed
  by the edit no longer counts as a mention.
- On read, `segments` render by reference: `[{text}, {mention: {name, handle}}…]`, so a renamed handle shows its new value.
  An author without a handle cannot be mentioned (Q18).

**Member family** (app Worker), keyed by board id; owner or active member, checked by `member_user_id`:

| Route | Who | Does |
|---|---|---|
| `GET /api/learn/c/:boardId` | owner, member | `{role, can, title, owner: {name, handle, avatar_url}, public_mode}` |
| `GET /api/learn/c/:boardId/board`, `/assets/:key` | member | the board read for `/c/` |
| `GET …/threads?status=&audience=&cursor=` | owner, member | 30 per page: `{id, audience, anchor, status, author, preview, replies, unread, last_activity_at, hidden_from_public}` |
| `POST …/threads` `{id, anchor, body, mentions, audience}` | per section 3 (`public` only while Open and not blocked) | 201 / 200 / 409 `id_conflict`; `{thread, accepted_mentions}` |
| `GET …/threads/:id?before=` | per section 3 | 50 messages: `{id, author, segments, created_at, edited, deleted, mine, can: {edit, delete}}` |
| `POST …/threads/:id/comments` `{id, body, mentions}` | per section 3 | 201 / 200 / 409 `id_conflict` / 409 `thread_full` |
| `PATCH …/comments/:id` `{body, mentions}` | the author, per section 3 | the edited message; mentions replaced |
| `DELETE …/comments/:id` | the author (Q23) or the owner | soft delete |
| `PUT …/threads/:id/color` `{color}` | whoever may resolve the thread | one of the six palette colours; `{thread}` |
| `DELETE …/threads/:id` | the owner; the starter while every live message is theirs | the whole thread, permanently; `{deleted}` |
| `POST …/threads/:id/resolve` · `/reopen` | per section 3 | |
| `POST …/threads/:id/read` | anyone who can read the thread (Closed and blocked included) | mark read |
| `GET …/people?audience=members\|public&q=` | anyone who can post in that audience | up to 8 `{name, handle, avatar_url}` from that audience's suggestion set; for a **new thread** (no thread id yet) |
| `GET …/people?thread=:id&q=` | anyone who can post in that thread | same, the audience taken from the thread; for **replies** |
| `PUT …/comment-settings` `{comments_enabled?, public_mode?}` | owner (`public_mode` only on a published canvas) | Allow comments and the public setting |
| `GET …/blocks` | owner | `[{block_id, person: {name, handle?, avatar_url?}, blocked_at}]`; a person without a handle shows as their name or "Rabbit Hole user" |
| `POST …/blocks` `{comment_id, remove_comments}` | owner | blocks the **author of that public comment**, by its stored `author_id`; no handle needed. `remove_comments` soft-deletes their public comments on this canvas. Never touches membership |
| `DELETE …/blocks/:block_id` | owner | unblock |

**Invitation family and the whole `members` subtree** (control plane, H1 and C4). The app Worker's `/api/learn/c/` router
falls through for `…/members…`, and production forwards it unchanged. These routes take a session only (`sessionOf` with
`uid`, never `cliAuth`), check Origin on POSTs, and answer `Cache-Control: no-store`.

| Route | Who | Does |
|---|---|---|
| `GET /api/learn/c/:boardId/members` | owner | `[{id, invited_email, status, email_status, person?: {name, handle?, avatar_url?}, invited_at, expires_at, locked}]` |
| `POST /api/learn/c/:boardId/members` `{emails}` | owner | always 200: `{invited: [{id, email_status}], skipped: [{email, reason, retry_after?}]}`; `reason` is one of `invalid_email`, `already_member`, `already_invited`, `limited`, `members_full`. 429 `limited {retry_after}` only when the owner's daily cap is used up before any address |
| `POST /api/learn/c/:boardId/members/:id/resend` | owner | rotates the token (the old link and every code die, `failed_attempts` reset) and sends: 200 `{email_status}`; 409 `already_joined`; 429 `limited {retry_after}` |
| `DELETE /api/learn/c/:boardId/members/:id` | owner | remove a member or cancel an invitation: status, `token_hash = NULL` and every open code ended, in one batch |
| `POST /api/learn/invites/preview` · `/code` · `/accept` · `/cancel` `{token, …}` | section 6 | the acceptance contract; the token is in the body, never in a path or query |

**Public family** (app Worker), keyed by the publication token; publications only; audience `public` only; never accepts or
returns a board id:

| Route | Who | Does |
|---|---|---|
| `GET /api/learn/boards/shared/:token/comments/threads?…` · `/threads/:id` | anyone who can open `/e/`, while Open or Closed | public threads |
| `POST …/comments/threads` · `…/threads/:id/comments` · `PATCH`/`DELETE …/comments/:id` · `/resolve` · `/read` | per section 3 (the same `can()` as the member family) | same contracts; audience `public` |
| `GET …/comments/people?q=` | signed in, not blocked, while Open | the public suggestion set (owner + public participants) |

- A share token (`/b/`) answers 404 on the public family.

**Mismatched ids always answer 404, never another object's data.** Each id in a path must belong to its parent:
thread → board, comment → thread, asset → board. Each case is a server test:
- a thread id from board A under `/api/learn/c/<board B>/threads/:id` (also for read, resolve, comments);
- a comment id from thread X under `…/threads/<thread Y>/…` or `PATCH`/`DELETE` through board B;
- a members thread id requested through the public family of the same canvas;
- a thread or comment of canvas A through the publication token of canvas B;
- an asset key of board A through `/api/learn/c/<board B>/assets/:key`, and a member of A asking for board B's assets;
- a block id from canvas A deleted through canvas B;
- an invitation token for canvas A accepted while the code was requested under another token;
- a `comment_id` from another canvas in `POST …/blocks`.
- `openShared` adds `comments: {public_mode}` for a publication, and `member_board_id` only when the signed-in viewer is the
  owner or an active member.

**Indicators and Library:**

| Route | Who | Does |
|---|---|---|
| `GET /api/learn/comments/unread` | signed in | `{owned: {<canvas>: n}, shared: {<board id>: n}}` |
| `GET /api/learn/c/shared-with-me` | signed in | `[{board_id, title, owner: {name, handle, avatar_url}, updated_at, unread}]` |

## 11. Failure and edge states [11]

| State | What the person sees |
|---|---|
| Send failed | Draft kept; "Couldn't send." with Discard / Retry; the send button is disabled; a retry never double-posts |
| Offline | "You're offline. Your reply is saved here. Press Retry when you're back." No automatic send |
| Over 5,000 characters | Red counter; Send disabled; 413 for older clients |
| Rate limited (per person) | "You've posted a lot in a short time. Try again in a few minutes." |
| Thread full (Q22) | "This thread is full. Start a new thread." |
| Membership removed mid-session (`/c/`) | "You're no longer a member of this canvas."; the unsent reply stays visible to copy. If the canvas is published, a link to its public page |
| Blocked (public threads) | "You can't comment publicly on this canvas. You can still read its public comments." A blocked member's members threads are unaffected |
| Retry hits `id_conflict` (a client bug, not a user state) | The draft is kept and resent once with a fresh id |
| Allow comments off | "Comments are turned off for this canvas." in place of the composer; threads readable; no Add comment |
| Public comments Closed | Threads readable; "Comments are closed. Existing comments stay visible." |
| Public comments Off | No Comments button or pins on the published page |
| Signed out on `/e/` | Readable; "Sign in to comment", resuming to the thread |
| Message or thread deleted meanwhile | "This comment was deleted" / "This thread isn't available" |
| Card deleted | Detached thread (section 8) |
| Invitation states | Section 6, screens a-k (including f′, the invitation lock), with `retry_after` rendered, never a fixed duration |
| Invitation email failed (owner) | "Email wasn't sent · Resend" |
| Edits | Separate rows; the last edit wins and shows "edited" |

## 12. File ownership

**New Comments modules (Comments lead owns):**
- `packages/control-plane/src/canvas-comments.js`: access resolver, the member and public families, mentions, unread
- `packages/control-plane/src/canvas-members.js`: the invitation family and the whole `members` subtree (served by the
  control plane: H1, C4), codes, recipient caps, blocks, settings
- `packages/control-plane/learn-migrations/00NN-canvas-comments.sql`
- `packages/control-plane/test/canvas-comments.test.js`, `canvas-members.test.js`, `canvas-invite-verify.test.js`,
  `canvas-comments-leaks.test.js`
- `packages/web/src/comments/`: `CommentsPanel.jsx`, `Thread.jsx`, `CommentComposer.jsx`, `AudienceRow.jsx`,
  `MentionMenu.jsx`, `CommentPins.jsx`, `comments-api.js`, `anchors.js`, `segments.js`, `unread.js`, `*.test.mjs`
- `packages/web/src/InvitePage.jsx` (the `/i` page, screens a-k; token from the fragment into `sessionStorage`)
- `packages/web/e2e/comments-check.mjs`
- this document

**Existing shared files: Parallel keeps review ownership; each change is reviewed before it is made:**

| File | Change |
|---|---|
| `packages/web/src/LearnPage.jsx` | Two-view panel header around the existing body; rename the stale label; header Comments button with count; pin and draft props |
| `packages/web/src/AdaptiveCanvas.jsx` | Pins layer; Comment tool; guarded `C`; Add comment / Add comment here; the view-only menu gate (:3177) for commenters |
| `packages/web/src/SharedBoardPage.jsx` | Comments panel and button on `/e/`, `/b/` (owner/member) and `/c/` |
| `packages/web/src/SharePanel.jsx` | People with access (with "Email wasn't sent · Resend"), Public comments Off/Open/Closed, Blocked |
| `packages/web/src/main.jsx`, `packages/web/dev-worker.js` | Routes and SHELL for `/c/<id>` and `/i` (served with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`); the `/api/learn/c/` router falls through for `…/members…` and never matches `/api/learn/invites/` (C4), with a unit test that both reach the control plane in production and are refused on a guarded binding |
| `packages/control-plane/src/index.js` (Home reviews) | Mount the invitation family and the `members` subtree before generic `/api/*` resolution (session only, Origin check); a narrow `sendInviteEmail(env, kind, to, fields)`, `sendEmail` staying private (H1) |
| `packages/web/src/ShortcutsSheet.jsx` | The `C` row |
| `packages/control-plane/src/learn-boards.js` | `openShared` adds `comments` and `member_board_id` |
| `packages/control-plane/repository-schema.sql` | Append the migration |
| `packages/web/src/LibraryViews.jsx` (and Home's cards) | Shared with you; the unread line on cards (cards lane) |
| Tests that regex-match the panel lines | `card-selection.test.mjs`, `learn-journey-ui.test.mjs:612-619`, `project-ui.test.mjs:45-48` |

**Home:** H1-H7 (section 6). `dev-forwarding.js` is **not** changed (H2 rejected).

## 13. Stages, tests and estimate

Each stage ends with `make test-unit` green plus its own checks. Implementation starts only after this revision is
reviewed and H7 is signed off.

### S1. Members and recipient-only invitations (control plane): 18-23 h

**Scope:**
- the migration (number from H5) and the access resolver;
- in the control plane (C4): the whole `members` subtree, the invitation family with HMAC codes, the batch statements, recipient
  caps (`canvas_invite_sends`) and `retry_after`, and `sendInviteEmail`;
- the app Worker fall-through for `…/members…`;
- the member board read, Shared with you, and the unread endpoint skeleton.

**Tests:**
- every role in section 3 against every route; the migration re-runs;
- no `invite_url`, principal or non-owner email in any response, asserted on every route;
- verification:
  - a forwarded link plus another account cannot accept without the code from the invited inbox;
  - every acceptance needs a fresh code, including when the signed-in email matches;
  - Send ends only this account's earlier codes; another account's accept answers `code_needed`;
  - expiry, 5 tries, single use, send limits;
  - Cancel invalidates the pending code;
  - owner Resend invalidates the old link and its codes; owner Cancel stops a recipient mid-flow;
  - already-member answers 409 and sends nothing;
  - a failed send records `email_status = failed`;
  - provider emails are never read;
- **Home's added tests (C7):**
  - recipient caps across two owners;
  - the `+tag` cap key;
  - `retry_after` for 15-minute and 24-hour windows (body and `Retry-After` header);
  - no token in any logged URL (body-only routes; `/i` link uses the fragment);
  - two concurrent accepts: exactly one 200 activates, the other gets the idempotent 200 or 404;
  - Resend versus accept, in both orders;
  - the unique-index rollback (409 `already_member`);
  - `owner_self`, `code_needed`, the invitation lock at 20 wrong codes, and no `cliAuth`;
  - echo fields absent with `SMALL_ENV` unset, `dev`, or `test` without the secret;
  - the code HMAC (no sha256 of the code anywhere); uniform code generation;
- permissions key on `member_user_id`;
- a comment or invitation write leaves `learn_boards.version`, `state_json` and `updated_at` unchanged, and an owner PUT on
  the old version still succeeds.

**STOP:** Home reviews the schema, the routes and the sender (H1-H3, H7).

### S2. Threads and comments: 10-13 h

**Scope:**
- the single `can()` policy used by both route families;
- create (idempotent, scoped), reply, edit and delete, each with the mention mapping;
- resolve per Q8;
- moderation, with blocks by account id;
- public mode;
- per-person limits and the thread size limit;
- pagination and unread.

**Tests — permissions:** every cell of the section 3 tables, through **both** route families. This includes:
- a blocked member: members threads unaffected; public posting, editing and resolving refused on both families; membership
  unchanged;
- Closed and blocked can still read and mark read;
- delete-own per Q23;
- blocking an author who has no handle;
- Unblock by `block_id`.

**Tests — contracts:**
- idempotency:
  - the same author, target and payload returns 200;
  - another author's id returns 409 with no content;
  - the same id with a different payload or another thread returns 409;
- mention mapping:
  - a range that does not match the text, an unknown handle, or someone outside the set stays plain text;
  - an edit replaces the mentions;
- people lookup by audience (new thread) and by thread (reply);
- every mismatched-id case in section 10 answers 404;
- the 1,001st message returns `thread_full`.

**Tests — leak suite:**
- members threads never on the public family (lists, counts, unread, anchors, people);
- public suggestions never include a member who has not posted publicly;
- share tokens answer 404;
- unpublish and republish behave as section 2 says;
- forks and Duplicate copy nothing;
- Trash suspends and Restore returns;
- a removed member loses unread and access.

**Tests — limits:**
- 413 and 429;
- two accounts at their limits do not block a third.

### S3. Owner canvas UI: 12-15 h

**Scope:** the two-view panel, the list with audience labels and filter, the thread view, the composer with "Visible to"
and explicit Retry, pins, and the entry points (menu, rail, guarded `C`, touch).

**Tests:**
- web unit: anchors, detach and reattach, segments, the `C` guards, the draft / Retry / disabled-send state;
- `card-context-menu-check` still passes.

### S4. Other pages and invitation screens: 13-16 h

**Scope:** the `/c/`, `/b/` (owner/member) and `/e/` panels; Share → People and Public comments; `InvitePage` screens a-h.

**Tests:** unit tests for each panel and each invitation screen state.

**STOP:** Figma from the local stack.

### S5. Mentions and indicators: 6-9 h

**Scope:** per-audience suggestion sets, chips by reference, unread on the pin, row, tab and header, and the Library and
Home card line with its refresh rules. The global inbox and email are deferred (Q7).

**Tests:** suggestion sets; server re-check; unread drops for lost canvases; the refresh triggers.

### S6. End-to-end: 8-11 h

**Scope:** `e2e/comments-check.mjs` on a local `SMALL_ENV=test` stack with the bypass secret (never a dev clone; H2), no model calls, and the test echo (H4), then Figma, docs and the
hand-off to Parallel.

**Accounts:**
- owner;
- a member via email sign-in;
- a member via Google mock sign-in;
- a forwarded-link holder;
- a removed member;
- a link viewer;
- a public commenter;
- a blocked user;
- a member who is also blocked from public commenting;
- a commenter without a handle;
- a signed-out visitor.

**Tests:** every flow, invitation screen, leak rule and failure state.

### Totals and changes

**Total:** about **67-87 agent-hours** (S1 18-23, S2 10-13, S3 12-15, S4 13-16, S5 6-9, S6 8-11), about 10-12 working days with
the review stops. Home adds about 1 h to check this diff, plus the pre-launch email items (H3), each at an owner GO.

**Revision 5 changes (net +5-7 h over revision 4's 62-81 h):**

| Change | Effect |
|---|---|
| The single `can()` policy and the full matrix tests through both families | +1 h |
| The mismatched-id 404 suite | +1 h |
| Scoped idempotency (`create_hash`) and the mention mapping with server validation | +0.5-1 h |
| Blocks by account id (via `comment_id`), `block_id` unblock, a handle-less e2e account | +0.5 h |
| Thread size limit (Q22) | +0.5 h |
| Aggregate newcomer cap deferred (Q12 recommendation) | -1 h |
| Home's H7 corrections C1-C7: S1 +3-4 h (sends table and caps, HMAC and batches, members subtree, fragment handling, tests); S4 +1 h (screens f′, i, j, k; rendering `retry_after`) | +4-5 h |

**Changes since revision 2 (when the estimate was 49-63 h):**

| Change | Effect |
|---|---|
| Recipient-only verification (Q1): codes, the control-plane contract, screens a-h, limits, test echo, e2e accounts | +10-14 h |
| The extra verification step is now for every recipient, including a matching signed-in email (HR4; revision 3's shortcut removed) | inside the line above; slightly simpler server, one more e2e path |
| Removing "Copy invite link" and `invite_url` (HR2); `email_status` and Resend with a fresh token (HR3) | about ±0 (less UI, a little more server) |
| Audience labels, "Visible to" and the audience filter | +1-2 h |
| Public comments Off/Open/Closed | +1 h |
| Explicit Retry with idempotent creates | +1 h |
| The new-participant guard instead of a per-canvas cap (revision 4; deferred in revision 5) | +1 h, removed again in revision 5 |
| Library and Home unread refresh | +1 h |
| Global inbox deferred (Q7 recommendation) | -2 h |

**Scope added:**
- a second email (the code);
- the account-confirmation step;
- eight invitation screens;
- `canvas_invite_codes`;
- delivery status;
- the control-plane acceptance contract.

**Scope removed:** invitation links in production UI and APIs; revision 3's matching-email shortcut; the global inbox (until
the owner decides Q7).

**Not included:** email notifications, a global inbox, live updates.

Test stacks are coordinated with Parallel before S3.

### Parallel execution plan (proposed; planning only, for after the owner's coding GO)

This plan uses the same scope and the same S1-S6 work, split across four lanes. Nothing starts until the owner authorizes
coding and current priorities are finished. No worker is launched by this plan.

**Hours.** "Agent-hours" means one agent's own working time: writing code, running tests, fixing failures. It is a
judgment, not a measurement. It excludes waiting for reviews. Elapsed time assumes each lane does about 6-8 hours of
productive work per working day; sessions also pause for owner prompts and approvals.

#### Agent availability (checked 2026-10-07)

| Lane | Proposed agent | Status now |
|---|---|---|
| Invitation and membership backend | Home ("Review agent and Claude documentation") | idle, but owns production and release readiness; its capacity after current priorities is the owner's call |
| Reusable frontend components, e2e script, Figma | Motion (this session) | available: the Motion lane is parked and the Comments spec is done |
| Comments backend | a **new dedicated worker session**, worktree `comments-backend` | none of the idle sessions has a free role I can confirm: `small-deploy-aa` is the Learning Path agent; `small-parallel-34` and `small-deploy-94` have roles unknown to me. A fresh session is recommended at GO |
| Shared-file integration and final gate | Parallel | busy; #46 (Professor Next Steps) integration comes first, and Comments integration starts after it |

#### Shared contracts, frozen first (step C0, before any lane writes code)

| Contract | Source | Owner | Must ack |
|---|---|---|---|
| Invitation and member API (`/api/learn/invites/*`, `/api/learn/c/:boardId/members*`) | §6, §10 | Home | Parallel, Motion |
| Comment API (member and public families, people, blocks, settings, unread) | §10 | comments worker | Parallel, Motion |
| Member read API (`/api/learn/c/:boardId`, `/board`, `/assets/:key`, `/api/learn/c/shared-with-me`) | §5, §10 | Home | Parallel, Motion |
| Migration split: **0011** invitations and members (`canvas_members`, `canvas_invite_codes`, `canvas_invite_sends`), **0012** comments (`canvas_comment_*`) | §7 | Home (0011), worker (0012) | Parallel numbers both; Home reviews both files |
| Access interface: `resolveCanvasRole(req, env, {boardId} or {publicationToken})` → `{role, user: {id, principal}, canvas: {org, name, owner}, board: {id}, publicMode, blocked}` in `control-plane/src/canvas-access.js` | §2, §3 | Home | worker (consumer), Parallel |
| Permission policy `can(actor, action, audience, publicMode, blocked)` | §3 | worker | Home, Parallel |
| API response fixtures `web/src/comments/fixtures/*.json`, one per route and state; each backend adds a contract test that its responses match them | §6, §10 | Motion writes them from the contract | Home, worker |
| Integration seams (component props): `CommentsPanel`, `CommentPinsLayer`, `PeopleWithAccess`, `InvitePage`, `MemberBoardPage`, the `C`-key guard and the menu-row descriptors | §5, §12 | Motion | Parallel |

C0 effort is 2-3 h (Motion drafts it; owners review). The review wait is about half a day.

#### Exact file ownership

| Lane | Owns (new files only, own branch and worktree) |
|---|---|
| **Home** (`feature/comments-members`) | `control-plane/src/canvas-members.js` (invitations, codes, caps, `retry_after`, members subtree, test echo); `control-plane/src/canvas-access.js` (`resolveCanvasRole`, member board and asset read, Shared with you); `control-plane/learn-migrations/0011-canvas-members.sql`; `control-plane/test/canvas-members.test.js`, `canvas-invite-verify.test.js`, `canvas-access.test.js`; the `sendInviteEmail` patch text for `index.js` (applied by Parallel) |
| **Comments worker** (`feature/comments-backend`) | `control-plane/src/canvas-comments.js` (both families, `can()`, threads, comments, idempotency, mention mapping, people lookup, blocks, public mode, limits, thread cap, unread); `control-plane/learn-migrations/0012-canvas-comments.sql`; `control-plane/test/canvas-comments.test.js`, `canvas-comments-leaks.test.js` |
| **Motion** (`feature/comments-ui`, worktree `comments-v1`) | `web/src/comments/*` (`CommentsPanel.jsx`, `Thread.jsx`, `CommentComposer.jsx`, `AudienceRow.jsx`, `MentionMenu.jsx`, `CommentPinsLayer.jsx`, `PeopleWithAccess.jsx`, `PublicCommentsSetting.jsx`, `comments-api.js`, `anchors.js`, `segments.js`, `unread.js`, `fixtures/`, `*.test.mjs`); `web/src/InvitePage.jsx`; `web/src/MemberBoardPage.jsx`; `web/e2e/comments-check.mjs`; this document; Figma |
| **Parallel** (`integration/comments-v1`) | Every shared file: `control-plane/src/index.js` (mount, `sendInviteEmail`), `control-plane/repository-schema.sql` (0011 and 0012 mirrors), `control-plane/src/learn-boards.js` (helper exports, `openShared` fields), `web/dev-worker.js` (narrow wiring; `/c` and `/i` SHELL), `web/src/main.jsx`, `web/src/LearnPage.jsx` (two-view tabs, header button), `web/src/AdaptiveCanvas.jsx` (pins layer, Comment tool, guarded `C`, menu rows, view-only gate), `web/src/SharedBoardPage.jsx` (panel on `/c`, `/b`, `/e`), `web/src/SharePanel.jsx` (one insertion), `web/src/ShortcutsSheet.jsx`, `web/src/LibraryViews.jsx` and Home's cards (with the cards lane), the panel regex tests; the merged-tree gate and the merge |

No lane edits another lane's files. A lane that needs a shared-file change sends Parallel the exact patch.

#### Effort per lane (total effort)

| Lane | Work | Agent-hours |
|---|---|---|
| Home | 0011 1; `canvas-members.js` 8-10; `canvas-access.js` 3-4; tests (the S1 list, including C7) 4-5 | 16-20 |
| Comments worker | 0012 1; `canvas-comments.js` 8-10; tests (permissions through both families, leaks, mismatched ids, idempotency, limits) 4-5 | 13-16 |
| Motion | API client and fixtures 1-2; CommentsPanel (list, filters, thread, composer, "Visible to", Retry) 6-8; pins layer and anchors 3-4; mentions, segments and unread 3-4; People, Public comments and Blocked 3-4; InvitePage (a-k) 3-4; MemberBoardPage 1-2; component tests 2-3; e2e script 2-3; Figma 1-2 | 24-31 |
| Parallel | shared wiring 2-3; LearnPage and SharePanel 2-3; AdaptiveCanvas 4-5; SharedBoardPage 1-2; Library 1-2; regex tests and rebase after #46 1-2; final gate 3-5 | 14-22 |
| Coordination | C0, contract tests, cross-reviews, handoff fixes | 4-6 |
| **Total effort** | | **71-95** (single-agent plan: 67-87; parallel adds 4-8 h of contract and integration overhead) |

#### What overlaps and what waits

| After | Can run at the same time | Must wait for |
|---|---|---|
| C0 frozen | Home backend, the worker's backend and Motion's components, each against contracts, fixtures and stubs | nothing else |
| C0 frozen **and #46 merged** | Parallel stages the shared seams: schema mirrors, route stubs, the two-view tab shell | #46 (Parallel's prior integration; date unknown) |
| Home backend and Motion's InvitePage, PeopleWithAccess and MemberBoardPage | Parallel wires **CP1** (invitation and membership checkpoint) while comments work continues | Home's review of the invitations migration file |
| Worker backend and Motion's CommentsPanel and pins | Parallel integrates LearnPage, AdaptiveCanvas and SharedBoardPage | a stable `CommentPinsLayer` API |
| All integration | final gate (Parallel), local-stack Figma (Motion), owner review | everything |

**Cannot overlap:** migration numbering before Parallel's ack; the AdaptiveCanvas integration before the pins API is stable;
the final e2e before full integration; the owner's review before the gate is green.

#### Longest dependency chain (elapsed, not effort ÷ agents)

The critical path is the frontend:

| Step | Agent-hours | Elapsed |
|---|---|---|
| C0 contract freeze, plus review | 2-3 | about 0.5 day, plus about 0.5 day waiting for acks |
| Motion's components | 24-31 | 3.5-5 days |
| Parallel's last UI integration: AdaptiveCanvas and LearnPage (earlier pieces overlap) | 6-8 | about 1 day |
| Final gate, including flake reruns | 3-5 | 0.5-1 day |
| Owner's Figma review | 0 | up to 1 day of waiting |

- **Full V1:** about **6.5-9 working days elapsed**, from GO to merge-ready.
- **Single agent, by comparison:** 67-87 h is about 10-14 working days at the same daily rate. Parallel lanes save about a
  third, not three quarters, because the frontend chain and the reviews are sequential.
- **The backends are off the critical path:** Home is about 2.5-3 days, the worker about 2-2.5 days.

**First local checkpoint (CP1), invitations and membership:**

| Step | Agent-hours |
|---|---|
| C0 | 2-3 |
| Home's backend (Motion builds the invite UI alongside it, 6-8 h, about 1 day) | 16-20 |
| Parallel's CP1 wiring | 3-4 |
| CP1 e2e and Figma | 3-4 |

That is about **4-5 working days elapsed**, plus the owner's review.

**Review waits on the chain:**
- the owner's coding GO;
- C0 acks from Home and Parallel;
- Home's review of both migration files;
- Parallel's rolling review of each handoff;
- a rebase after #46, whose date is unknown;
- the owner's Figma reviews (CP1 and final).

These waits, not agent time, decide most of the calendar.

**Ways to shorten the chain** (not assigned; the owner's choice):
- once its backend is done, around day 2-3, the comments worker takes the mention and indicator components (about 5-8 h)
  off Motion's lane;
- Parallel starts the AdaptiveCanvas pins integration against Motion's frozen `CommentPinsLayer` props with a fixture, rather
  than the finished component.

**Local stacks:**
- Motion: 8858/8859 (allocated).
- The comments worker: unit tests only (`node:sqlite`), no stack.
- Home: unit tests, plus a stack only if it needs one (ports from Parallel).
- Parallel: its integration stack.
- No dev clone runs the invitation flow (H2); no model calls.

## 14. Review conditions for S1 (Parallel, 2026-10-07) and deferred items

Recorded for when the owner gives S1 its GO. They are not authorization to start.

**Parallel's shared-file conditions:**
- `control-plane/src/index.js`: mount the invitation family and the members subtree before generic `/api/*` resolution, with
  session only and the Origin check. Shadow no existing `/api/learn/*` route; a test proves they still resolve.
- `repository-schema.sql`: the migration is numbered **0011** (learn migrations end at 0010; renumber at merge if the pending
  `0011-user-profile-bios` is ever approved). Header: "local only until deploy GO; applies after 0010". Re-runnable, never
  applied remotely.
- `web/dev-worker.js`: one narrow line that falls through for `…/members` and never catches `/api/learn/invites/`, plus the
  `/c` and `/i` SHELL entries (no-referrer, no-store), each pinned by a test.
- `web/src/main.jsx`: `/c/[id]` and `/i` next to `/b` and `/e`.
- `web/src/SharePanel.jsx`: one `PeopleWithAccess` insertion. The copy stays truthful once people have access; display
  identity is `@handle` only, with emails only in the owner's own pending list.
- `web/src/LearnPage.jsx`: **not edited.** PeopleWithAccess derives the canvas name and board id from what SharePanel already
  receives.
- `control-plane/src/learn-boards.js`: export the existing helpers rather than fork them (#46 changes them).
- Rebase onto main before the checkpoint diff, and again after #46.
- Local stack on ports 8858/8859 with its own `WRANGLER_REGISTRY_PATH`. Model calls are stubbed; after #46, start through
  the provider tripwire entrypoints.

**Parallel's review checks:**
- **Codes:** 6 digits from `crypto.getRandomValues` (never `Math.random`); stored as an HMAC, never plaintext; compared in
  constant time; never logged or returned, except the `SMALL_ENV=test` echo.
- **The invitation-wide lock is a deliberate DoS trade-off.** Someone with the link and an account can lock an invitation
  with 20 wrong codes, and the owner can resend. The lock is **visible to the owner** in People ("Locked after too many wrong
  codes · Resend"), and the recipient sees screen f′. Both are tested.
- **Security bar:**
  - the code is single-use, expiring and rate-limited by the H7 limits (per invitation and account, per account, per
    recipient across owners, 5 tries, the 20-code lock); no per-IP limit in the design (Parallel accepted option (a));
  - membership binds only after a fresh code verified by the signed-in account;
  - a member read follows Trash and link revocation;
  - view and comment only, never edit;
  - no other person's email reaches a member;
  - the owner can revoke.

**Deferred: production readiness** (not part of any checkpoint):
- **Edge per-IP rate limiting** (Cloudflare rate limiting rules) on the invitation and comment routes.
- **Home's H3 pre-launch items**, each at an owner GO:
  - the Resend plan and quota (the account is shared with apateo.ai);
  - DMARC `p=none` (DNS);
  - a first production send;
  - rotating a full-access key to sending-only.
- Home reviews the actual migration file before any remote application. Remote migrations and deploy need a separate GO (H6).
- Public-comment UI decisions (Q2-Q4, Q7, Q19-Q21, Q23) stay with their stages (S2-S5) and do not block an
  invitations/membership checkpoint.
