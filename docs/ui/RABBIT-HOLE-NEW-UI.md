# Rabbit Hole New UI

Give Claude Code this file first. It is the entry point for implementing the UI references in `docs/ui` on `chatgpt/tutor`.

This document routes work to the detailed screen handoffs and shared component library. It does not authorize implementing every screen, deploying the application, or changing feature behavior. Work on the screen requested by the owner.

## Screen handoffs

| Screen | Required implementation handoff | Complete HTML reference | Status |
| --- | --- | --- | --- |
| Start a rabbit hole | [START-DIALOG.md](START-DIALOG.md) | [12-start-rabbit-hole.html](clean/12-start-rabbit-hole.html) | Templates and source mapping pushed; runtime integration and browser verification pending |
| Sidebar, Search, Trash, Notifications and Feedback | [SIDEBAR.md](SIDEBAR.md) | [16-sidebar.html](clean/16-sidebar.html) | Owner-reviewed reference; runtime integration and browser verification pending |
| Settings and account states | [SETTINGS.md](SETTINGS.md) | [21-settings.html](clean/21-settings.html) | Async states and API contract tested; browser verification and runtime integration pending |

| Canvas summary cards: Home, Library and Explore | [CANVAS-CARD.md](CANVAS-CARD.md) | [36-canvas-card.html](clean/36-canvas-card.html) | Four sizes and description states; zero-star count hidden; browser verification and runtime integration pending |

**For Start a rabbit hole, read START-DIALOG.md in full.** It maps every visible element to its canonical template, component, CSS selector, behavior script and icon. It distinguishes existing primitives from the four newly authorized templates and records the latest copy, button, resize and focus corrections.

**For the sidebar and its panels, read SIDEBAR.md in full.** It maps the shell, four panels, shared primitives, icons and behavior, including feedback submission confirmation and concise copy.

**For Settings, read SETTINGS.md in full.** It maps all five panes, state previews, the server handle-conflict contract and outstanding browser checks. Dark-theme tokens are deferred until the end.

**For canvas summary cards, read CANVAS-CARD.md in full.** Reuse the single shell across all four sizes. Descriptions remain readable and complete. A zero star total has no visible count or divider; the Star action remains available.

Add future screen-specific handoffs to this table as they are prepared. A component appearing in the library does not by itself establish that its full screen flow has been reviewed or integrated.

## Required reading order

1. Read the current repository `AGENTS.md`, `CLAUDE.md` and `UI.md` on the implementation branch.
2. Read the selected screen handoff from the table above and inspect its complete HTML reference.
3. Read the linked component records, editable markup/templates, shared styles and behavior scripts. Follow actual dependencies rather than estimating values from screenshots.
4. Inspect the latest integrated app component and its callers before editing. The handoff's app paths are mapping landmarks, not a frozen implementation to overwrite.

The latest explicit owner decision takes precedence over older references. Within this library, follow the [current review corrections](REVIEW-UPDATES.md), [palette roles](foundations/PALETTE.md), [design tokens](foundations/tokens.json) and the selected screen's specific contract. Flag unresolved conflicts instead of silently choosing a new design. Historical/hidden Flow examples are not current styling targets.

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
