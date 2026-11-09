# Library

Read [RABBIT-HOLE-NEW-UI.md](RABBIT-HOLE-NEW-UI.md) first. [Complete HTML reference](clean/43-library.html) · [Component record](components/navigation/library/README.md).

Owner-reviewed HTML reference; no runtime changes. The screenshot supplies layout. Current main `25b7c61a037054675f888a71d18cc6d4b8cba084` supplies the exact filter and sort choices; inspected `App.jsx`, `LibraryViews.jsx`, `library-filter.js`, `home/card-sort.js`, `LibraryFolders.jsx`, and `library-folders.js`. These inspected modules are unchanged from the earlier audit snapshot.

## Reuse map

| Element | Canonical UI source | Current app mapping |
| --- | --- | --- |
| Sidebar and panels | [SIDEBAR.md](SIDEBAR.md), `templates/sidebar.html` includes | `Sidebar.jsx`, `Search.jsx`, `FeedbackButton.jsx` |
| Card shell, description, star, Open and options | [CANVAS-CARD.md](CANVAS-CARD.md), `templates/canvas-card.html`, `home-overlays.html`, `styles/canvas-card.css`, `scripts/home.js` | `home/LearningCard.jsx`, `home/CardMenu.jsx`, `CardStar.jsx` |
| Folder tiles and menus | [FOLDERS.md](FOLDERS.md), `folder-tiles.html`, `folder-overlays.html`, `scripts/folders.js` | `LibraryFolders.jsx`, `library-folders.js` |
| New folder | Shared secondary button plus existing Folder-plus icon | `App.jsx`, `LibraryFolders.jsx` |
| Start action and modal | [START-DIALOG.md](START-DIALOG.md), shared primary button and Plus icon; existing Start template/widgets/grip | `App.jsx`, `StartDialog.jsx` |
| Search | Shared `.control`, Search glyph | `App.jsx` name/repository search |
| Filters, sort and checked rows | Shared `.menu`, `.menu-item`, check icons, dividers and focus states | `LibraryViews.jsx` LibraryFilters, `home/LearningCard.jsx` SortMenu |
| Active filter pills | Shared `.pill.neutral`, icon buttons and X | `LibraryViews.jsx` ActiveFilters |
| Card size | Same four-step slider/readout and saved preview preference as Home | `home/CardSize.jsx`, `home/card-size.js` |
| Page layout | `templates/library-main.html`, `library-menus.html`, `styles/library.css` | `App.jsx` Library header and controls |
| Empty content | Flat page treatment with Library or FolderOpen glyph | `ui.jsx` EmptyState, `LibraryFolders.jsx` FolderEmpty |

`library.js` adapts the same card/menu controller used by Home through `RH_CARD_HOST`; it does not fork the card template or action handler implementation. Shared folder tiles were extracted to an include so both screens render the same component. Page-specific layout is new composition; controls, type sizes, icons and colors come from the established library. Additional icons use the exact Lucide names from app imports (`lucide-react@1.41.0`), with license in `icons/library-NOTICE.txt`.

## Exact menus

Sort uses one selected choice. Each row has a leading Lucide icon from `icons/library.svg`: Clock for Last updated, CalendarPlus for Created, ArrowDownAZ for Name, and GitFork for Most forked. Keep the selected checkmark on the right; icons are decorative and labels remain accessible. Use the existing menu icon size, stroke and colors.

Sort choices:

| Label | Behavior |
| --- | --- |
| Last updated | Newest update first; fall back to creation time |
| Created | Newest creation first |
| Name | Case-insensitive, numeric-aware ascending title |
| Most forked | Highest count first, then newest update |

Break remaining ties by stable canonical ID. The preview remembers the sort under `rabbit-hole.ui-preview.librarySort`. Production reuses `readLibrarySort`/`saveLibrarySort`, scoped by organization and viewer. Card size shares `rabbit-hole.ui-preview.cardSize` with the Home preview; production retains `small.cardSize`. Invalid/blocked storage must not break the controls.

Filters:

- Type: **Projects**, **Canvas**, **Apps**, **Archived canvas**.
- Ownership: **Mine**. The current code does not offer Workspace or Shared with me as ownership choices; do not invent them.
- Type choices toggle off if selected again. Archived is the Canvas type with the archived flag, not a second independent type selection. Changing Type clears Archived.
- Count active Type and Ownership selections; Archived counts as one Type filter. Show removable pills and Clear filters.
- The populated Library root fixture opens with Canvas selected. The empty Library root and both standalone folder fixtures open without active filters. Navigating from the Library into a folder keeps any current filters.

## Screen behavior

- Align the Library title left and New folder with Folder-plus and Start a rabbit hole with Plus right. Inside a folder, the colored folder title takes the left position and Folder options takes the New folder position. Keep the earlier per-card Stars design and omit the standalone action.
- Group Search and Filters on the left of the second row, with Sort and Card size on the right. On narrow screens, let the groups reflow with single-line button labels. The title row and controls use the same layout for empty and populated results.
- Place the search glyph just to the left of the input border. Keep it in the input's label so clicking it focuses the field.
- Preserve the approved warm palette; omit the screenshot's old blue dot grid and old ownership badge.
- Search title or repository name, case-insensitively. At Library root, normal results omit filed cards; searching includes them. Inside a folder, results remain scoped to that folder.
- Folder click opens its contents with a Library breadcrumb. Inside a folder, its options button replaces New folder. Deleting the folder returns to Library and unfiles its items. Moving a visible card into a folder removes it from the normal root list; search can still find it.
- No selected Type means sections in Projects, Canvas, Apps order, at most six initial items per section with View all. Selected Type means its full matching list.
- Archived and Apps match the current toolbar behavior: hide name search, learning-card sort and card-size controls, and folder creation/tiles. Their populated content renderers remain separate integration work (below).
- Empty results, empty folder, no matching type and no archived canvases have concise distinct messages. Clear filters preserves folder location. The preview's empty-result recovery also clears the search text.
- Existing hover/focus Open and menu actions, touch visibility, full descriptions, yellow stars and hidden zero-star counts remain unchanged.
- Menus support arrow keys, Home/End, Escape, focus return, outside click and viewport clamping. Use custom menu components, never native select elements.

## Gaps and boundaries

This file uses three local canvas fixtures: two unfiled and Model evaluation inside Machine learning. Search, sorting, filter changes, folder navigation/assignment, rename, duplicate and trash/restore are local demonstrations. Canvas opening, Start completion, server persistence and sidebar destination routes remain unconnected.

Share/access and Change cover still lack approved full templates and remain disabled. Populated archived-canvas recovery rows and the operational Apps table are not represented by these canvas fixtures; their filters show the appropriate empty state here. Do not invent operational app features. The unfiltered Library's Comment inbox and Shared with you integrations also need their own populated reference pass; do not silently treat notifications as equivalent.

New reusable composition: the Library header/toolbar, selected filter pills and code-derived filter/sort menu arrangement. All primitives were available. No new palette or alternative card/sidebar design was introduced.

## Verification

Run canonical build/export/check scripts. Use `verification/library-interactions.cjs` with the same LinkeDOM test dependency as Home for the recorded non-browser behaviors. Run `home-interactions.cjs` too because the controller is shared. Executed and passed: type/ownership filters and removable pills, selected counts, name sorting and remembered order, search including filed cards, folder scope/breadcrumb, Archived empty state, and menu keyboard handlers/focus return. Existing Home interaction tests also passed after adding the shared controller adapter. These do not establish browser rendering, native Tab order or backend correctness. Visual review at narrow widths and real browser interactions remain pending.

Update this handoff and RABBIT-HOLE-NEW-UI.md in the same push after owner review.

## Open folder reference

[44-library-folder.html](clean/44-library-folder.html) opens Machine learning with a populated canvas card. The main Library example opens the same view when you select Machine learning; LeetCode demonstrates an empty folder. Both use the same Library template, styles and controller, with a small initial-folder fixture script.

- Match `LibraryFolders.jsx` FolderCrumb and FolderTitle: Library breadcrumb, colored folder icon and folder name. Library returns to the root with current filters and sorting kept.
- Search is scoped to the open folder and labeled accordingly. Sort icons, card-size presets, filter chips and card menus are the same components as the Library root.
- Folder options replace New folder: Rename, Colour, Delete folder. Renaming and recoloring update the heading and breadcrumb; deletion returns to Library and unfiles contents. These folders are flat; no invented nested folders.
- Empty folder uses the app's flat EmptyState layout. Center the FolderOpen glyph and the short Move to folder instruction below the controls. Clear filters is available when active filters or search exclude existing items.
- Start remains the shared Start dialog. Production folder placement on creation is not demonstrated or promised by this local reference.
- This is a Library organization folder, which can contain projects or canvases. A repository project's own detail/workspace page is a separate surface, not represented here.

The populated folder adds no new visual primitive. Non-browser DOM checks passed for the populated view, scoped search label, rename, delete/unfile and empty folder; the existing Library and Home suites also passed. Browser rendering and native keyboard traversal remain unverified.

## Empty and populated screen coverage

| Screen | Empty | With canvases |
| --- | --- | --- |
| Home | [40-home-empty.html](clean/40-home-empty.html) | [37-home.html](clean/37-home.html) |
| Library | [45-library-empty.html](clean/45-library-empty.html) | [43-library.html](clean/43-library.html) |
| Open folder | [46-library-folder-empty.html](clean/46-library-folder-empty.html) | [44-library-folder.html](clean/44-library-folder.html) |

An empty Library keeps New folder, Start, and the search toolbar in place. Show the Library glyph and “Your library is empty.” on the page surface. An empty open folder keeps its breadcrumb, colored title, options, Start, and the scoped toolbar in place. Both use the existing warm palette. The empty account fixture hides Recent in the sidebar. The empty folder fixture retains account-wide Recent entries. DOM checks cover the shared header structure, folder icon visibility, and true-empty versus no-match states. Browser layout verification is pending.
