# Sidebar polish

Owner brief, 2026-10-06 (task #64). The Rabbit Hole sidebar is navigation plus a small Recent launcher. The expanded sidebar is calm, and the collapsed state is a purpose-built rail, not the sidebar with its text removed. The live (small) build's sidebar is unchanged.

```
Expanded, 260px (resizable 200-400)        Collapsed rail, 64px
[Y] Yuvish ▾                       ‹       [Y]
                                            ›
Search                                     Search
Notifications                              Notifications

Home                                       Home
Library                                    Library
Explore                                    Explore

PINNED (only when something is pinned)
RECENT
  [icon] Logistic regression
  [icon] Backpropagation thr…
────────────────────                       ────
Trash                                      Trash
Feedback                                   Feedback
```

## Top row

- The person is the only top anchor: no product mark or name row above them.
  - The account rules still hold: the shown name, never the internal principal or a Gmail-derived workspace (`session-display.js`).
  - The aperture mark (`ProductMark`) shows only while the identity is unknown.
- The account row is 56px tall, with a 32px avatar, the name in semibold and a small chevron.
  - `aria-label` "Account menu"; it opens the existing menu (Settings, Log out).
  - A subtle ring and surface show while the menu is open.
- The panel control sits at the right of the row: the panel icon (`PanelLeftClose`) "Collapse sidebar". On the rail it is `PanelLeftOpen` "Expand sidebar", under the avatar. It draws the panel, as the canvas's right panel toggle does, not a chevron (owner, 2026-10-08).
  - It is smaller and quieter than a nav row, so it reads as a panel control, not a destination.
- Ctrl/⌘+\ still toggles.

## Rows

- One button per destination serves both states (`Sidebar.jsx` `navRow`, `ROW`).
  - It is 40px tall, with an 18px icon whose centre is 32px from the sidebar's edge.
  - On the 64px rail (`home/pinned.js` `RAIL_W`), the same row is a centred 44x40 target with its label faded out.
  - Collapsing changes only the width: the labels fade (150ms) while the width contracts in 200ms, in step with the Shell's slide. No icon moves sideways.
  - There is no spring. With `prefers-reduced-motion`, there is no transition, including the Shell wrapper's.
- **Where you are** (`aria-current="page"`) has a tinted surface, stronger text and a 3px bar on the left.
  - It looks the same on the rail. It is never a blue block: blue stays for actions.
  - An open panel (Search, Notifications, Trash, Feedback) gets the plain active surface without the bar.
- **Tones** (`TONE`): Home is neutral, Library violet and Explore teal.
  - The tinted icons sit at 75% until current.
  - Everything else is neutral, and Trash is never red: nothing in the sidebar destroys anything.
- **Notifications** shows its count at the end of the row, or in the corner of the rail button.
- **Feedback** is Learn's `FeedbackButton`, drawn as a row through its new optional `trigger` prop. The Learn canvas's square button is unchanged.
  - Its strip is fixed, because the sidebar clips overflow, and follows the sidebar's width.
  - Its panel opens beside the sidebar.

## Recent

- Recent is shown only when the sidebar is expanded (`sidebar-nav.js` `recentLaunch`).
  - It holds the top two, in the order opened on this device (`small.recent`, the list Home's Recent reads) (owner, 2026-10-08; it was five).
  - A pinned item shows under Pinned only, so no canvas appears twice.
- Each row shows the type icon and title on one line, truncated. The full title shows in a tooltip on hover or keyboard focus.
- The ⋯ menu (Open, Pin/Unpin, Copy link) appears only on hover or focus. The row is a keyboard link, with Enter to open, and the ⋯ is its sibling.
- There is no "View all" (owner, 2026-10-08): Library, above it, is the full list.
- The RECENT label is a quiet small-caps label. It still collapses the list, and its chevron shows on hover or focus while open.
- The old Private list, which repeated Recent, is gone. Managing what you own is the Library's job.
- Pinned stays, only when something is pinned, because it is where pins made from a Library card or the Agent Bar show.

## Rail

- The rail is navigation only. Recent and Pinned are not rendered there, and no canvas initials or content icons appear.
- Every rail control has a tooltip: Account menu, Expand sidebar, Search, Notifications, Home, Library, Explore, Trash and Feedback.
  - It shows 400ms after hover or keyboard focus (`:focus-visible`), just past the sidebar's edge.
  - It is compact inverted chrome, like `ui.jsx` `Tip`, portaled so the sidebar's overflow cannot clip it.
  - A press, leaving, blur or Esc hides it.
- Hovering never expands the rail. Only the panel control or the shortcut does.

## Preference

- Expanded or collapsed, and the width, are this browser's UI preference: `small.sidebar` and `small.sidebarW`.
  - They are never the account's and never canvas content.
- `sidebar-nav.js` `readSidebar` / `saveSidebar` guard storage. Storage that throws reads as expanded at 260px and keeps nothing.
- Below `md` there is no rail, whatever is stored: the top strip opens the full sidebar as a drawer (Shell.jsx, unchanged).
- Tablet keeps the desktop behaviour, which the brief allows.

## Trash

- Trash is unchanged: Library Trash with Restore and the footer "Items stay in Trash until you restore them. Nothing here is deleted." (library-trash.md).
- One fix: the footer copy now follows the build, not the loaded list. The live build's 30-day line no longer flashes while the Library's Trash loads.

## Supersedes

- The 52px rail of rabbit-hole-t02-spec.md and rabbit-hole-checklist.md: the product-mark tile and Open sidebar.

## Tests

- `src/sidebar-nav.test.mjs`: Recent is capped at two with no pinned items; the preference is remembered; blocked storage.
- `src/home/pinned.test.mjs`: the 64px rail edge.
- `e2e/sidebar-check.mjs`, 16 checks against the local stack:
  - widths;
  - the top anchor;
  - order and no duplicate lists;
  - truncation and the title tooltip;
  - the Home and Library active state;
  - the account menu;
  - no View all (Library opens the Library);
  - the panel icon on Collapse and Expand;
  - the rail's targets, navigation-only content and remembered collapse;
  - every rail tooltip on hover with its delay;
  - keyboard focus, Esc;
  - no hover expand;
  - Trash with Restore from the rail and expanded;
  - reduced motion;
  - dark expanded and rail;
  - no phone rail.
