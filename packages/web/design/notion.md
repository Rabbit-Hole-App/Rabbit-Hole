# Notion design spec for `packages/web`

Not "Notion-inspired". Notion. Every value below is measured from the real app.
If shadcn's default shows through anywhere, it's a bug.

---

## 1. Tokens

Put these in `tailwind.config` as the *only* palette. Delete shadcn's defaults.

### Color

| token | light | use |
|---|---|---|
| `bg` | `#FFFFFF` | page background |
| `bg-sidebar` | `#F7F7F5` | sidebar background |
| `bg-hover` | `#EFEFED` | row and item hover |
| `bg-active` | `#E8E8E6` | selected sidebar item, pressed state |
| `bg-code` | `#F7F6F3` | inline code and code blocks |
| `border` | `#E9E9E7` | dividers, table borders when shown |
| `border-strong` | `#D3D1CB` | input borders on focus |
| `text` | `#37352F` | body |
| `text-secondary` | `#787774` | help text, timestamps, meta (`rgba(55,53,47,.65)` on white) |
| `text-secondary-strong` | `#6F6E69` | secondary text that must stay readable at 12px |
| `text-tertiary` | `#9B9A97` | placeholders, disabled |
| `text-on-accent` | `#FFFFFF` | |
| `accent` | `#2383E2` | links, focus rings, primary button |
| `accent-hover` | `#1B6FC2` | |
| `danger` | `#EB5757` | |
| `warn` | `#D9730D` | |
| `success` | `#448361` | |

Property pill colors (Notion's tag palette), background / text:

| name | bg | text |
|---|---|---|
| grey | `#E3E2E0` | `#32302C` |
| brown | `#EEE0DA` | `#442A1E` |
| orange | `#FADEC9` | `#49290E` |
| yellow | `#FDECC8` | `#402C1B` |
| green | `#DBEDDB` | `#1C3829` |
| blue | `#D3E5EF` | `#183347` |
| purple | `#E8DEEE` | `#412454` |
| pink | `#F5E0E9` | `#4C2337` |
| red | `#FFE2DD` | `#5D1715` |

Status mapping: running → blue, finished → green, failed → red, skipped → grey, queued → yellow.

### Type

Font: **Inter**, with `font-feature-settings: "cv11", "ss01"` and `-webkit-font-smoothing: antialiased`. Fallback `ui-sans-serif, system-ui`.

| role | size | weight | line-height | color |
|---|---|---|---|---|
| page title | 40px | 700 | 1.2 | `text` |
| h1 | 30px | 600 | 1.3 | `text` |
| h2 | 24px | 600 | 1.3 | `text` |
| h3 | 20px | 600 | 1.3 | `text` |
| body | 16px | 400 | 1.5 | `text` |
| ui (sidebar, tables, buttons, pills) | 14px | 400–500 | 1.4 | `text` |
| small / meta | 12px | 400 | 1.4 | `text-secondary` |
| code | 14px `SFMono-Regular, Menlo, monospace` | 400 | 1.4 | `#EB5757` inline on `bg-code`; `text` in blocks |

Page title (40px) gets `letter-spacing: -0.01em`. Everything else gets none. Hierarchy comes from weight and the space above.

### Spacing and shape

- Base unit 4px. Row heights: sidebar item 28px, table row 32px, list row 36px, input 32px, button 32px (small 28px).
- Radius: 4px on inputs, buttons, pills, rows. 6px on cards and popovers. Never more.
- Shadows: **only** popovers and menus: `0 0 0 1px rgba(15,15,15,.05), 0 3px 6px rgba(15,15,15,.1), 0 9px 24px rgba(15,15,15,.2)`. Nothing else has a shadow.
- Page: sidebar 240px fixed. Content pane has 96px horizontal padding on desktop, max content width 900px, **left-aligned**, not centered. Top padding 48px before the page icon and title.
- Transitions: 100ms on hover states, 200ms ease-out on panels sliding in. Nothing bounces.

### Icons

Lucide, **16px** in sidebar and rows, **20px** in headings, stroke 1.5. Color `text-secondary` at rest, `text` on hover. Never colored icons except status dots.

Page icons: one emoji or a 20px Lucide icon left of the title, chosen per app kind — `Globe` for server, `Play` for job, `Clock` for scheduled job, `Webhook` for webhook.

---

## 2. Sidebar

240px, `bg-sidebar`, full height, resizable by dragging its right edge (min 200, max 400), collapsible with `⌘\`.

Top to bottom:

1. **Workspace switcher** — org name with a 20px icon, chevron on hover, 36px row. Click opens a menu; for now it lists the one org and *Log out*.
2. **Search** — a row with `Search` icon and label, opens the search modal. Shortcut `⌘K`.
3. **Divider** (8px gap, no line).
4. **Section: Apps** — 12px `text-secondary` uppercase-free label "Apps", with a `Plus` icon on hover at the right that copies `small deploy` to clipboard with a toast *Run this in your project*. Under it, one 28px row per app: 16px kind icon, name, and on hover a `MoreHorizontal` icon at the right (menu: Copy link, Open, Delete). Selected row is `bg-active` with 500 weight. Hover is `bg-hover`.
5. **Section: Recent** — the five most recently opened, same rows.
6. **Bottom, pinned:** `Settings` row, `Help` row, and the current user's email at 12px `text-tertiary`.

Rows are flush left with 12px padding. No borders anywhere in the sidebar.

---

## 3. Page header

Every page:

- **Breadcrumb**, 14px, `text-secondary`, `Org / Apps / counter`, each segment a link, `/` separators, at the very top of the content pane.
- Right side of the same line: **Share** button (secondary style), then a `MoreHorizontal` icon.
- Below: 20px page icon, then the **page title** (40px). Title is inline-editable on click, saves on blur.
- Under the title, one line of **properties** as a horizontal list, 14px: kind pill, visibility pill, `Last deployed 2h ago`, `main · a3f8e21`. Each property is `text-secondary` label + value.
- Then the **tab bar**: 14px, `text-secondary`, active tab `text` with a 2px `text` underline, 32px tall, no background. Tabs: Runbook · Run · Logs.

---

## 4. Components

Each one is a shadcn primitive with the styling replaced.

**Button**
- Primary: `accent` bg, white text, 500 weight, 32px, radius 4, no shadow, hover `accent-hover`.
- Secondary: transparent bg, `text`, 1px `border`, hover `bg-hover`.
- Ghost: transparent, `text-secondary`, hover `bg-hover` and `text`. This is the default for most actions.
- Icon buttons are 28px squares, ghost.

**Input**
- 32px, `bg-code` background, no border at rest, 1px `border-strong` on focus plus a 2px `accent` ring at 20% opacity. Placeholder `text-tertiary`. Radius 4.
- Help text below, 12px `text-secondary`.
- Error: border `danger`, message below in `danger`.

**Select** — same as input; opens a menu (see Menu). Selected value shows as text, not a pill.

**Toggle** — Notion's: 30×16px pill, `#E3E2E0` off, `accent` on, 12px white knob. No label inside.

**Slider** — 2px track `border`, 16px white knob with the popover shadow, `accent` fill for the filled side. A number input to its right, 64px wide.

**Dropzone** — dashed 1px `border` box, `bg-code`, 80px tall, centered `Upload` icon and *Drop a file or click to browse*. On hover `bg-hover`. After drop: file name, size, `X` to clear.

**Date** — input that opens a small calendar popover. Supports `-7d`-style relative values shown as *7 days ago*.

**Pill (property value)** — 20px tall, 2px 6px padding, radius 4, 12px 500 weight, one of the tag colors.

**Menu / popover** — white, popover shadow, radius 6, 4px padding, items 28px with 16px icon and 14px label, hover `bg-hover`. Keyboard navigable. Section labels 12px `text-tertiary`.

**Toast** — bottom-left, dark `#37352F` bg, white 14px text, radius 6, auto-dismiss 3s, one action link in `accent`.

**Empty state** — centered in the content area: 20px `text-secondary` icon, one line 14px `text-secondary`, one ghost button. Nothing else.

**Code block** — `bg-code`, radius 4, 16px padding, 14px mono, `Copy` icon button top-right on hover.

**Panel (slide-in)** — 480px from the right, white, left border `border`, 200ms ease-out. Header with title and `X`. Used for the log view and the share popover on narrow screens.

---

## 5. Tables (Notion databases)

The Logs tab for jobs, the Deploys tab, the people list in Share.

- No outer border. Header row 32px, 12px `text-secondary` labels, each with a 16px type icon at left (`Type` for text, `Hash` for number, `Calendar` for date, `CircleDot` for status, `User` for person, `Paperclip` for file).
- Body rows 32px, 1px `border` between rows only, hover `bg-hover`, cursor pointer. Click opens the row (run page).
- First column is the row's title, 500 weight; the rest are properties: status as a pill, person as a 20px avatar circle with initials plus name, dates as relative text (*2 hours ago*, hover shows the full timestamp), numbers right-aligned, files as `Paperclip` icon plus name.
- On row hover, a ghost `Play` icon appears at the far right for *Run again*.
- **Toolbar above the table**, 32px, right-aligned ghost buttons: `Filter`, `Sort`, `Search` icon that expands to an inline input, and a `Plus` for *New run* on job tables. Filter opens a menu of properties; picking one adds a pill under the toolbar (`Status is Failed ×`). Sort same.
- Empty table: one row of `text-tertiary` text, *No runs yet*, and the New run button.
- Column widths are draggable; widths persist in localStorage per table.

---

## 6. Search (`⌘K`)

Modal, 640px wide, popover shadow, centered at 20% from the top. One input at the top (16px, no border), results below grouped by section — *Apps*, *Runs*, *Runbooks* — each result a 36px row with icon, title, and grey breadcrumb. Arrow keys move, Enter opens, Esc closes. Searches app names, runbook text, and run inputs.

---

## 7. Behaviors that make it feel like Notion

- **Hover reveals.** Row actions, section `+` buttons, table `Play` icons, code `Copy` — none are visible until the pointer is over their container.
- **Everything is a link.** Rows, breadcrumbs, property values that reference something. Middle-click opens a new tab.
- **Optimistic updates.** Share adds the person to the list immediately; a failure reverts and toasts.
- **Keyboard everywhere.** `⌘K` search, `⌘\` sidebar, `Esc` closes any panel, `Enter` submits any form, arrows in menus and tables.
- **Relative time by default**, absolute on hover.
- **No loading spinners** on navigation. Skeleton rows in `bg-hover` at the same height as real rows.
- **No modals for confirmation** except Delete, and that one has the item name in the body and a red primary button.
- **No borders on lists.** Separation is whitespace and hover, not lines.

---

## 8. Per-page layout

**`/apps`** — title *Apps*, a table: name (icon + title), kind pill, visibility pill, members (avatar stack), last deployed. Toolbar with Search and Filter. Hover row → `ExternalLink` (Open) for servers, `Play` (Run) for jobs.

**`/apps/<slug>`** — header as §3. Tabs:
- *Runbook*: rendered markdown, Notion typography, tables as §5 without toolbar, code blocks as §4.
- *Run* (jobs with inputs): form generated from `[inputs]`, one field per row, label 14px 500 left, control right at 320px wide, help under. Primary **Run** button bottom-left. Servers: this tab is replaced by an **Open** primary button in the header.
- *Logs*: servers → request log table (time, method, path, status pill, ms, person). Jobs → runs table as §5.

**`/apps/<slug>/runs/<id>`** — breadcrumb ends with the run id. Title is `Run a3f8e21` with status pill in the properties line plus person, started, duration. Sections with h3 headings: *Inputs* (property list), *Output* (declared with label + `Download`, images as 200px thumbnails, small json/csv inline in a code block), *Log* (code block, last 20 lines, *Show all* link). Header right: **Run again** secondary button.

---

## 9. What shadcn ships that must be overridden

- `ring` color → `accent` at 20%, 2px, offset 0.
- `radius` → 4px base. shadcn's `lg` is too round.
- `border` color → `#E9E9E7`. shadcn's is too dark.
- Button `default` → our secondary. shadcn's black button never appears.
- Card → delete it. Nothing here is a card.
- Table → strip the outer border and the header background.
- Dialog → keep only for Delete. Everything else is a panel or popover.
- Fonts → Inter, loaded from Google Fonts with `display=swap`, features enabled.

---

## 10. What else Notion has — verified against their help center

Confirmed behaviors, with whether `small` should adopt them:

| Notion behavior | Adopt? |
|---|---|
| Sidebar resizes by dragging its right edge; `<<` collapses; collapsed sidebar peeks on hover at the left edge | **Yes** — in `components.html` |
| Sidebar section headings (Apps, Recent) click to collapse; sections drag to reorder | Yes for collapse; skip reorder |
| Hover any sidebar page → `+` to nest, `⋯` for menu | `⋯` yes; nesting no — apps don't nest |
| Table columns resize by dragging header edges; reorder by dragging headings; widths persist | **Yes** — resize in `components.html`; reorder later |
| Hover a row → checkbox at left for multi-select; header checkbox selects all; bulk edit menu | **Yes** — select; bulk actions = delete / re-run |
| `⋮⋮` grip on row hover to drag-reorder rows | Show the grip; reorder is meaningless for runs — skip |
| Footer **Calculate** row: count, sum, average, min, max per column | **Yes** — count for runs, sum/avg for duration and numeric inputs |
| **Properties** button: show/hide columns per view | **Yes** — inputs columns get noisy fast |
| Filter, Sort, and **Group by** a property; filters can be saved for everyone | Filter + Sort yes; Group by status is genuinely useful for runs — later |
| Rows open in **side peek** by default (table, board, list); center peek; full page | **Yes** — side peek is the run page; the table stays interactive behind it |
| Multiple **views** of one database: table, board, list, gallery, calendar, timeline | Table only. A board grouped by status is the one other view worth having, later |
| Database **lock** to prevent edits | Not needed — runs aren't editable |
| Every page has an icon, a cover, and inline-editable title | Icon and title yes; no covers |
| `⌘K` search across everything; `⌘\` sidebar; `⌘P` quick find | Yes to all three |
| Comments and mentions on pages | Later, on runs — "why did this fail?" is a real thread |
| Templates, synced blocks, AI writing, integrations gallery | No |

## 11. Reference

Tokens verified against the open-source Notion design-system repo and a May 2026 measured snapshot of notion.so: `#37352F`, `#2383E2`, `#E9E9E7`, `#D3D1CB`, `#9B9A97`, `#F7F6F3` all confirmed.


Open notion.so side by side. If a screenshot of ours next to a screenshot of theirs shows a difference in row height, text color, or icon weight, ours is wrong.
