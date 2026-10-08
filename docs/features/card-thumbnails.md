# Card thumbnails

Owner, 2026-10-08: Home, Library and Explore cards (canvas and project cards) show a picture of the canvas.
- No upload is needed. Each card shows an automatic snapshot of its canvas, drawn in the browser when the canvas saves, at no AI cost.
- The creator can replace it with their own image.
- Privacy: Explore shows pictures only for published canvases. A private canvas's picture is never visible to anyone else.
- Cost: about one small image per canvas in storage.

Owner layout, the same day: "then the image will be on the right of the card. you can show one card per row if needed", and "each card should be same size but also allow enough space to show an image that can be seen". The reference is distill.pub's list: one post per row, with a wide picture on the right.

## The card

`packages/web/src/home/LearningCard.jsx` (card-redesign.md):

```
[type]  Title                          Visibility  ⋮   ┌──────────────────────┐
        @handle                                         │  picture, 2:1        │
Description, three lines (two beside actions or a note) │  38% of the card     │
actions                                                 └──────────────────────┘
[fork] N forks · Updated 2h ago                  Open →
```

- **One card per row** (`CARD_ROWS`) on Home's Continue and Recent, the Library and Explore, and the creator profile. At 1440 px two per row left the picture at about 180 × 90 px, too small to make out. One per row shows it at about 350 × 175 px (about 205 × 102 px at 1024 px with the sidebar open).
  - Shared with you keeps its small cards on `CARD_GRID`.
- **Every card is the same size.** From `md`, the card is a fixed 228 px high (`CARD_HEIGHT`).
  - The title clamps to two lines.
  - The description clamps to three lines, or two when the card has actions or a note.
  - Nothing grows a card.
- **The picture** is 2:1, at the card's right from `md`, 38% of the card wide and at most 500 px. It is cropped with `object-fit: cover`.
  - On a phone, the picture sits above the text at full width, still 2:1. The text below it is a fixed 196 px high, so phone cards are the same size too.
- **No picture yet** (a new or empty canvas, or one whose owner has not opened it since thumbnails shipped): the slot shows a quiet placeholder.
  - The placeholder is the canvas's own dot grid on a faint tint of the type colour (green for a canvas, purple for a project), with the type icon.
  - There is never an empty grey box.
  - The card keeps its size and layout.
- Jobs and servers on Home's Recent have no picture slot.

## The snapshot

`packages/web/src/card-thumbnail.js` draws the snapshot; `LearnPage.jsx` decides when.

- **When:** after each save of an owned main board that changed its content (`saveBoard`, the existing board save path). It waits for a 4 s pause in saving, sends at most one snapshot every 30 s, and only for content that differs from the last snapshot sent. It is never drawn on every keystroke.
- **On open:** a board with no picture yet gets one about 4 s after it opens (one `HEAD`).
  - This covers canvases made before thumbnails, and forks.
  - An empty canvas draws nothing and keeps its placeholder.
- **What it shows:** the canvas's content bounds, with a 24 px margin, made 2:1 (`thumbnailRegion`).
  - Wide content is centred.
  - A tall column keeps its top, widened by at most half again, so it still reads.
  - The region is never smaller than 400 canvas px wide, so the zoom is at most 2x.
- **How it is drawn:** with `html-to-image`, which is already the canvas's area-ask and sketch capture. The camera layer is restyled onto the region and drawn at 800 × 400, then saved as WebP (PNG where WebP encoding is missing). The check's three-card canvas came to about 11 KB.
  - Iframes and videos are left out, because their pixels are cross-origin.
  - Toolbars, hover-only connection ports and card tools, and a selected shape's outline and handles are left out.
  - The app font is skipped: the system font reads the same at this size.
- **Where:** `PUT /api/learn/boards/<app>/main/thumbnail`, the bytes as the body. No model call is made anywhere.
- **Theme:** the page background is used, so a canvas saved in dark mode gets a dark picture.

`ponytail:` a change made in the last 4 s before leaving the canvas waits for its next save there, because drawing needs the canvas on screen. Flush on leave if stale cards are reported.

## Change thumbnail

The ⋮ on your own canvas and project cards (`home/CardMenu.jsx`) has two entries:
- **Change thumbnail:** choose a PNG, JPEG or WebP image of at most 10 MB.
  - The browser crops it to 2:1 from its centre and redraws it at 800 × 400.
  - It is sent to `PUT …/thumbnail/custom`.
  - It takes precedence over the snapshot while it exists.
  - Any other file is refused in one line, for example "Choose a PNG, JPEG or WebP image."
- **Use canvas snapshot:** shown only while a picture of yours is up (the menu reads `X-Thumbnail-Source` with one `HEAD`). It sends `DELETE …/thumbnail/custom`, and the card shows the latest snapshot.
- The card itself shows the change, through a new address in the page (`bumpThumbnail`). No toast appears unless something fails.

## Serving and privacy

Server code is in `packages/control-plane/src/learn-boards.js`.

| Route | Who | Answers |
|---|---|---|
| `GET`/`HEAD /api/learn/boards/<app>/main/thumbnail` | The owner only: `boardOwner`, the board routes' own check. A project is whoever may open its Learn, and each person gets their own board's picture. | The custom picture, else the snapshot. 204 when there is neither. |
| `PUT …/thumbnail`, `PUT …/thumbnail/custom`, `DELETE …/thumbnail/custom` | The owner, from this origin | `{ source, size }` |
| `GET`/`HEAD /api/learn/boards/published/<token>/thumbnail` | Anyone, signed out too | Only while the canvas is in Explore: the `PUBLISHED` set (live, top level, not in Trash, owner has a @handle) |

- **Other people:**
  - Signed out: 401.
  - Another workspace: 404.
  - Same workspace, not the owner: 403.
  - An unlisted canvas's share token is not a publication: 404 on the published route, even though the share link itself opens.
- **Trash and Archive:** a canvas in Trash or archived has no picture for anyone, the owner included (404). The Library's archived view shows the placeholder. Restore brings the picture back.
- **Unpublish** removes the picture from everyone else at once.
- **Addresses:** your own cards use the canvas name, which your cards already link (`/apps/<name>`). Explore and profile cards use the publication token from their `/e/<token>` link. A picture address never carries an email or an owner id.
- **Headers:**
  - `Cache-Control: private, no-cache` with an `ETag`, so a browser revalidates (304) and nothing is shared from a cache.
  - `X-Content-Type-Options: nosniff`.
  - A sandboxing CSP.
- **Uploads** are checked by their bytes: PNG, JPEG or WebP only (`sniffImageType`, as dropped images are), so an SVG or HTML body is 415 whatever its declared type. The limit is at most 1 MB (413).

## Storage

There is no migration and no new column. Pictures sit in the existing media bucket (`LEARN_MEDIA`, the bucket context documents and board files use), under the main board row's id:
- `learn-thumbnails/<board id>/snapshot`
- `learn-thumbnails/<board id>/custom`

Each is one small WebP per canvas, plus a custom one only when the owner chose one. The key carries no email or name.
- A fork or Duplicate gets its own snapshot when its owner first opens it. Board files are copied, but pictures are not.
- `ponytail:` nothing deletes pictures. There is no hard delete of a canvas yet, and Trash keeps everything. Add a sweep with a hard delete.

## Tests

- **Server:** `packages/control-plane/test/card-thumbnails.test.js` (4 tests) covers:
  - 204 then the snapshot, the custom picture winning and the revert, HEAD;
  - byte sniffing, 1 MB, origin, main board only;
  - the privacy matrix: signed out, another workspace, a colleague, unlisted, published, unpublished, Trash, Restore, Archive;
  - a project's Main canvas.
- **Web unit:** `packages/web/src/card-thumbnail.test.mjs` covers:
  - the region rules;
  - the scheduler: pause, gap, unchanged content, empty canvas, retry after a failed upload;
  - the upload checks and the addresses;
  - the card layout pins: one per row, fixed height, 2:1 on the right from `md`, on top on a phone, the placeholder, the owner-only menu.
- **Browser:** `packages/web/e2e/card-thumbnails-check.mjs` runs on the local stack only, started through the provider tripwire. It has 13 checks:
  - a save draws an 800 × 400 WebP with the content in it;
  - a board on the server gets one on open, and an empty canvas gets none;
  - there is no second snapshot without a change;
  - the picture is on the right at 2:1 and 38%;
  - one card per row, every card one size, the placeholder, no failed loads;
  - Change thumbnail refuses a GIF and replaces with a PNG cropped to 2:1;
  - Use canvas snapshot reverts;
  - another person gets 404 for private and unlisted;
  - published is visible to anyone, and unpublished is gone;
  - Explore shows the pictures on the right, by token;
  - the phone layout;
  - no page errors and the tripwire at 0.
