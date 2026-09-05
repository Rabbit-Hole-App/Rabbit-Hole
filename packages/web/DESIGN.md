# small — dashboard design system

**Authoritative specs live in `design/` (read-only — never edit):**
- `design/notion.md` — measured Notion tokens, type scale, components, behaviors
- `design/components.html` — the pixel reference (open it in a browser)
- `design/flow.md` — every screen and what each click does

When this file and `design/` disagree, `design/` wins. The app is converged to
`design/` as of v5: tokens (hover #EFEFED, active, code, line-strong, ink-3,
status colors, tag palette), 16px body / 40px·700 titles / 28px sidebar rows /
32px table rows with row borders, popover-only shadow-pop, toasts, menus,
skeletons, empty states, ⌘K search, ⌘\ sidebar.

The look is Notion. Not "inspired by" — match it. Every token and component
below lives in `src/index.css` (`@theme`) and `src/ui.jsx`; use those, never
ad-hoc values. If a default from shadcn/BlockNote/Excalidraw shows through,
it's wrong.

## Color (the only seven)

| Token (Tailwind) | Hex | Use |
|---|---|---|
| `white` / `--color-background` | `#FFFFFF` | page + popover surfaces |
| `ink` | `#37352F` | all primary text and icons-on-hover |
| `ink-2` | `#787774` | secondary text, resting icons, labels |
| `line` | `#E9E9E7` | every border and divider |
| `hover` | `#F1F1EF` | every hover surface, input backgrounds, pills |
| `side` | `#F7F7F5` | sidebar + code/log blocks |
| `accent` | `#2383E2` | ONE accent: links, primary action, checkmarks. Sparingly. |

Avatar chips use the Notion tag palette (see `AVATAR_BG` in ui.jsx), hashed by
email so a person keeps their color everywhere. No other colors. No gradients.
Shadows: exactly one faint shadow, popovers/panels only
(`0 0 0 1px #e9e9e7, 0 8px 24px rgba(0,0,0,0.08)`).

## Type — Inter everywhere, hierarchy by weight not size

| Role | Class | Size/weight |
|---|---|---|
| Page title (`Apps`, app name) | `text-[28px] leading-tight font-bold` | 28/700 |
| Panel title | `text-[15px] font-semibold` | 15/600 |
| Body, rows, inputs, breadcrumb | `text-sm` | 14/400, line-height 1.5 |
| Row emphasis (app name in table) | `text-sm font-medium` | 14/500 |
| Labels, meta, roles, counts | `text-xs text-ink-2` | 12/400 |
| Pill buttons (OPEN/RUN) | `text-[11px] font-medium uppercase tracking-wide` | 11/500 |
| Logs / code | `font-mono text-xs` | 12 |

## Components (src/ui.jsx — always import, never re-style)

- `Button` — ghost text button (`variant="ghost"`) or accent (`variant="accent"`).
- `PillButton` — Notion's hover affordance (the bordered `⧉ OPEN` pill). Reveal on
  row hover with `opacity-0 group-hover:opacity-100`; Run/Stop use it always-visible.
- `IconBtn` — 24px square ghost icon button (sidebar chrome, ✕, +, «).
- `Pill` — property chip (kind, visibility, schedule). `bg-hover`, 12px.
- `Avatar` — 20px initial circle, `title` = email.
- `Tabs/TabsList/TabsTrigger` — underline tabs, active = ink underline + medium.
- `KindIcon` — app-kind glyph (server/job), 14px, `ink-2`.

## Icons

Lucide only, monochrome. Sizes: 10–12 inside pills, 13–14 in rows/buttons,
15–16 for chrome toggles. Resting color `ink-2`, `ink` on hover. Never filled
except the Stop square.

## Interaction rules

- Every enabled clickable shows the hand cursor — global CSS rule in index.css,
  don't add per-element `cursor-pointer`.
- Hover reveals, never layout-shifts: reveal with `opacity-0 group-hover:opacity-100`.
- Hover surface is always `bg-hover` (sidebar rows, table rows, popover rows).
- Rows: 36px min height, no zebra, no cell borders; header is 12px `ink-2` with a
  single `border-line` underline.
- Panels slide from the right (`slide-in-right` keyframe, 250ms), non-modal.
- Popovers: one faint shadow, no border-radius over 6px, rows not lines.
- Horizontal scroll only when actually needed: wide content sits in its own
  `overflow-x-auto` wrapper and the page body never scrolls sideways.
- Empty states: one quiet `ink-2` line + one action.

## Layout

- Sidebar 240px `side`, collapsible («, reopens with » top-left).
- Content pane: left-aligned, `px-24` desktop (32px laptop, 16px phone),
  `max-w-[1150px]` for tables, `max-w-[900px]` for document-like pages.
- Breadcrumb (14px, `ink-2`) at the top of the content pane; no top nav bar.

## Voice

Terse, one-line, `✓`/`✗`-prefixed status lines (`✓ finished (exit 0) · 12s`).
The product voice everywhere, including errors.
