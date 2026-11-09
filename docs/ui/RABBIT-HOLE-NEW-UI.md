# Rabbit Hole New UI

Give Claude Code this file first. It is the entry point for implementing the UI references in `docs/ui` on `chatgpt/tutor`.

This document routes work to the detailed screen handoffs and shared component library. It does not authorize implementing every screen, deploying the application, or changing feature behavior. Work on the screen requested by the owner.

## Screen handoffs

| Screen | Required implementation handoff | Complete HTML reference | Status |
| --- | --- | --- | --- |
| Canvas Chat composer and commands | [CHAT-PANEL.md](CHAT-PANEL.md) | [Composer](clean/07-chat-composer.html), [Answer detail](clean/60-chat-answer-detail.html), [Slash commands](clean/61-slash-commands.html) | Approved HTML references |
| Canvas Search | [CANVAS-SEARCH.md](CANVAS-SEARCH.md) | [62-canvas-search.html](clean/62-canvas-search.html) | Filter search, matching icons and keyboard interactions checked in fixtures. Browser and runtime verification pending |
| Start a rabbit hole | [START-DIALOG.md](START-DIALOG.md) | [12-start-rabbit-hole.html](clean/12-start-rabbit-hole.html) | Templates and source mapping pushed; runtime integration and browser verification pending |
| Sidebar, Search, Trash, Notifications and Feedback | [SIDEBAR.md](SIDEBAR.md) | [16-sidebar.html](clean/16-sidebar.html), [Search](clean/51-explore-library-search.html) | Clear search and focus recovery checked in the fixture. Browser and runtime verification pending |
| Settings and account states | [SETTINGS.md](SETTINGS.md) | [21-settings.html](clean/21-settings.html) | Async states and API contract tested; browser verification and runtime integration pending |
| Canvas summary cards: Home, Library and Explore | [CANVAS-CARD.md](CANVAS-CARD.md) | [36-canvas-card.html](clean/36-canvas-card.html) | Four sizes and description states; zero-star count hidden; browser verification and runtime integration pending |
| Home: Continue learning and Recent | [HOME.md](HOME.md) | [37-home.html](clean/37-home.html) | Deduplicated cards, remembered size, state previews and keyboard DOM checks; browser/runtime verification pending |
| Folder tiles, options and assignment | [FOLDERS.md](FOLDERS.md) | [42-folders.html](clean/42-folders.html) | Rename, Colour, Delete and New folder with Folder-plus icon; local state only |
| Library: search, filters, sort and folders | [LIBRARY.md](LIBRARY.md) | [43-library.html](clean/43-library.html), [44-library-folder.html](clean/44-library-folder.html) | DOM checks passed for empty and populated states. Browser and runtime verification pending |
| Explore: Canvases, Creators, rankings and search | [EXPLORE.md](EXPLORE.md) | [Empty](clean/47-explore-empty.html), [With canvases](clean/48-explore-canvases.html), [Search previews](EXPLORE.md#search-previews) | Clear search and Browse headings checked in fixtures. Browser and runtime verification pending |
| Creator profile and discovery | [CREATOR-PROFILE.md](CREATOR-PROFILE.md), [backend handoff](CREATOR-DISCOVERY-BACKEND.md) | [Linked flow](clean/50-explore-creator-search.html), [profile states](CREATOR-PROFILE.md) | Return navigation, paging and recovery checked with fixtures. App integration and browser verification pending |

**For Start a rabbit hole, read START-DIALOG.md in full.** It maps every visible element to its canonical template, component, CSS selector, behavior script and icon. It distinguishes existing primitives from the four newly authorized templates and records the latest copy, button, resize and focus corrections.

**For the sidebar and its panels, read SIDEBAR.md in full.** It maps the shell, four panels, shared primitives, icons and behavior, including feedback submission confirmation and concise copy.

**For Settings, read SETTINGS.md in full.** It maps all five panes, state previews, the server handle-conflict contract and outstanding browser checks. Dark-theme tokens are deferred until the end.

**For canvas summary cards, read CANVAS-CARD.md in full.** Reuse the single shell across all four sizes. Descriptions remain readable and complete. A zero star total has no visible count or divider; the Star action remains available.

**For Home, read HOME.md in full.** Home has no top-level Stars button; per-card stars remain. It composes the existing sidebar, canvas summaries and Start dialog, with deduplication, remembered Card size, genuine continuation metadata, loading/error/empty references and the hover/focus Open action. It lists missing card-management templates and local-only behavior. Read FOLDERS.md for the shared folder menu and assignment patterns.

**For Library, read LIBRARY.md in full.** It records the code-derived filter and sort choices, leading icons for every sort option, populated/empty folder views, folder/search behavior, shared component sources, and remaining integration gaps.

**For Explore, read EXPLORE.md in full.** It maps public canvas cards, Creators, weekly rankings, and the active tab’s search. Read SIDEBAR.md for the account Library modal.

**For the public creator profile, read CREATOR-PROFILE.md in full.** It maps the populated and empty profile, the separate Stars collection, and the lifetime engagement totals shared with regular Creator cards.

Add future screen-specific handoffs to this table as they are prepared. A component appearing in the library does not by itself establish that its full screen flow has been reviewed or integrated.

## Required reading order

1. Read the current repository `AGENTS.md`, `CLAUDE.md` and `UI.md` on the implementation branch.
2. Read the selected screen handoff from the table above and inspect its complete HTML reference.
3. Read the linked component records, editable markup/templates, shared styles and behavior scripts. Follow actual dependencies rather than estimating values from screenshots.
4. Inspect the latest integrated app component and its callers before editing. The handoff's app paths are mapping landmarks, not a frozen implementation to overwrite.

The latest explicit owner decision takes precedence over older references. Within this library, follow the [current review corrections](REVIEW-UPDATES.md), [palette roles](foundations/PALETTE.md), [design tokens](foundations/tokens.json) and the selected screen's specific contract. Flag unresolved conflicts instead of silently choosing a new design. Historical/hidden Flow examples are not current styling targets.


## Empty and populated screen coverage

| Screen | Empty | With canvases |
| --- | --- | --- |
| Home | [40-home-empty.html](clean/40-home-empty.html) | [37-home.html](clean/37-home.html) |
| Library | [45-library-empty.html](clean/45-library-empty.html) | [43-library.html](clean/43-library.html) |
| Open folder | [46-library-folder-empty.html](clean/46-library-folder-empty.html) | [44-library-folder.html](clean/44-library-folder.html) |
| Explore | [47-explore-empty.html](clean/47-explore-empty.html) | [48-explore-canvases.html](clean/48-explore-canvases.html) |
| Creator profile | [53-creator-profile-empty.html](clean/53-creator-profile-empty.html) | [52-creator-profile.html](clean/52-creator-profile.html) |

Keep the page top-aligned beside the sidebar in both data states. Empty Home has its message on the left and Start at the top right. Empty Library and folder views retain the title actions and toolbar. Inside a folder, the breadcrumb stays above the title and Folder options sits beside Start. The empty icon and copy sit on the page below the toolbar. See [HOME.md](HOME.md) and [LIBRARY.md](LIBRARY.md) for the component mappings and fixture rules.

## Shared library entry points

| Need | Reference |
| --- | --- |
| Folder structure and editing workflow | [README.md](README.md) |
| Search components by name, state or app path | [Searchable catalog](index.html) |
| Browse standalone working specimens | [Component library](rabbit-hole-component-library.html) |
| Exact component IDs and dependencies | [registry.json](registry.json) |
| Component-to-app landmarks | [MAPPING.md](MAPPING.md) |
| Original source inventory | [INVENTORY.md](INVENTORY.md) |
| Known inconsistencies and gaps | [REVIEW.md](REVIEW.md) |
| Latest owner corrections | [REVIEW-UPDATES.md](REVIEW-UPDATES.md) |
| Validation scope and remaining limitations | [VERIFICATION.md](VERIFICATION.md) |

## Reuse rules

- Every new or updated UI screen handoff must update this master index in the same push, including the handoff, complete HTML reference and current status. This is a standing owner requirement: do it automatically without asking or waiting for a reminder. A UI handoff is incomplete until this index is updated.
- Use the selected screen's component map. Reuse the existing app components and helpers, extending shared primitives deliberately when they need to match the current reference.
- Do not invent alternative buttons, fields, tabs, menus, icons, palettes, type sizes, spacing or resize controls. A visually similar custom implementation is not evidence of reuse.
- Preserve each component's hover, pressed, selected, keyboard-focus and disabled states. Preserve single-line action labels, readable text, bounded resizing and shared pale scrollbars where the screen contract requires them.
- If a needed component or state is missing, identify the gap for the owner before designing it. Continue independent work already covered by existing references. Add any newly authorized reusable template to this library before consuming it.
- Preserve real app behavior, access checks, loading/error handling and persistence. HTML demonstration callbacks are not production implementations.
- Do not copy specimen-only controls or completion messages into the app. Each screen handoff identifies its demonstration boundaries.
- Edit canonical component/template sources, then regenerate exports. Do not independently maintain the assembled HTML as a second design.
- Keep this master file as the index. Put detailed screen decisions and component mappings in the linked screen handoff so there is one maintained source for each contract.

## UI copy rule: avoid over-explaining

- Let titles, labels and actions explain themselves. Do not add helper text that repeats their meaning.
- Add supporting copy only when it communicates a necessary action, non-obvious consequence, constraint or recovery step.
- Keep preview disclaimers, sample-data labels, implementation notes and testing instructions out of the product interface. Record demonstration limitations in the handoff or review message instead.
- Use concise empty states and action feedback. Do not add a second sentence merely to fill space.
- Remove unused footer containers when their copy is removed.

Owner examples: remove “Restore a canvas to your library.”, “Sample items · Changes last until you reload this preview.” and “Preview only · Feedback is not sent.” from the sidebar panels.

## Completion hand-back

For the requested screen, report:

1. Exact implementation commit and changed app components.
2. The handoff/reference used and a mapping of reused library components.
3. Any shared primitive changes, newly authorized templates or remaining mapping gaps.
4. Checks actually executed and their results. Separate structural checks, browser interactions, real backend behavior and deployed verification.
5. Remaining limitations and the review link or artifact required by the owner's request.

Do not call a screen integrated or visually verified solely because its HTML builds or its static checks pass.
