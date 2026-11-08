# Home

Read [RABBIT-HOLE-NEW-UI.md](RABBIT-HOLE-NEW-UI.md) first. [Complete HTML](clean/37-home.html) · [Component](components/navigation/home/README.md).

Status: UI reference approved for branch push; browser verification and runtime integration pending. No app code is changed. Main's `Home.jsx`, `CardSize.jsx`, `CardMenu.jsx` and menu inventory were checked at `25b7c61a037054675f888a71d18cc6d4b8cba084`; these files are unchanged from the earlier audited main snapshot.

## Reused components

| Home element | Canonical UI sources | App mapping |
| --- | --- | --- |
| Sidebar, account menu and utility panels | [SIDEBAR.md](SIDEBAR.md), `templates/sidebar*.html`, `styles/sidebar.css`, `scripts/sidebar*.js` | `Sidebar.jsx`, `Search.jsx`, `FeedbackButton.jsx` |
| Continue and Recent cards | [CANVAS-CARD.md](CANVAS-CARD.md), `templates/canvas-card.html`, `styles/canvas-card.css` | `home/LearningCard.jsx` |
| Size control | Shared `input[type=range]` styling in `standards.css`; four-step input, named accessible values | `home/CardSize.jsx`, `home/card-size.js` |
| Start button | Shared `.button.primary` | `Home.jsx` Start trigger |
| Start dialog | [START-DIALOG.md](START-DIALOG.md), canonical `templates/start-rabbit-hole.html` and its includes, shared widgets/resize | `StartDialog.jsx` |
| Card options | Shared `.icon-button.quiet`, Ellipsis glyph, `.menu`, `.menu-item`, dividers and danger state | `home/CardMenu.jsx`, `home/card-menu-items.js` |
| Rename and description editing | Existing `.dialog`, `.field`, `.control`, secondary Cancel and primary Save | `home/CardMenu.jsx` |
| Trash confirmation | Existing dialog and danger/secondary buttons; Move to trash then Cancel; no duplicate close X | `home/CardMenu.jsx` |
| Palette and scrollbars | `foundations/palette.css`, `styles/standards.css`, `styles/review-corrections.css` | Shared app theme |

The new work is the Home layout composition (`templates/home*.html`, `styles/home.css`) and local demonstration orchestration (`scripts/home*.js`). Sidebar and card markup are included from their canonical templates, not copied into a new design. `home-mount.js` replaces only the sidebar specimen's empty content area. The Start wrapper uses native modal behavior and the same internal shell, source widgets, fields, controls and resize grip.

## Layout and behavior

- **Owner decision: no top-level Stars button on Home.** Remove its toolbar action and the specimen-only Stars view. Keep the star actions on individual canvas cards. This supersedes the screenshot and the current `Home.jsx` toolbar; it does not remove the Library stars feature.
- Use the top-right Size and Start toolbar, Continue learning, then Recent. Use the shared warm page palette; do not reproduce the old blue page grid.
- Label the slider **Card size** and show the current preset beside it. Remember it across reloads; default to Large only when no valid saved value exists. The standalone reference uses `rabbit-hole.ui-preview.cardSize` to avoid touching an account setting. App integration must reuse `home/card-size.js` and `small.cardSize`. Blocked storage must not break resizing.
- Continue has a visible Continue action. Exclude its canvas ID from Recent; hide Recent when nothing remains. Do not guess the Continue canvas from list order. Use the explicit continuation record.
- Show **Last explored: <topic>** only when the continuation record supplies nonblank text. Do not infer it from a title or document. The specimen includes an explicit fixture topic, not a claim about this user’s activity; `RH_HOME_DATA` can supply real items and `continueId`. The no-topic specimen shows omission.
- Recent retains the existing secondary **Open →** button in its footer. It appears on hover and keyboard focus, stays visible on touch/narrow screens, and remains in the keyboard tab order when visually hidden. Title and focused-card Enter also open; body clicks do not. Keep the options trigger beside Private, not over the thumbnail.
- Card options appear on hover, keyboard focus or while open; touch keeps them visible. Actions never overlap the title or Private pill. Small layouts reflow.
- Zero stars show no count or divider. Selection is yellow. Copies of the same canvas synchronize; different canvases have independent state.
- The existing sidebar remains resizable and collapsible. Narrow screens initially collapse it to preserve content space. Shared pale scrollbars are reused.
- Descriptions, menu changes, duplicate and trash/restore are local state only. Native dialogs return focus to their triggers. Menus support arrow keys, Home/End and Escape.

## Missing templates and integration boundaries

The complete Home arrangement did not previously have a library specimen; this draft supplies it with existing components. These dedicated app flows still lack complete approved UI templates:

1. Change cover, including upload failures and reset to the canvas snapshot.
2. Share/access management.
3. Analytics for eligible public canvases (not applicable to the private cards shown here).

Cover and Share rows are disabled in this review HTML. Move to folder now opens working local folder rows, selection, New folder (with Folder-plus icon) and Remove from folder; the same data/controller is used in [FOLDERS.md](FOLDERS.md). Do not infer production permissions or remove the real app features from that disabled demo state. Menu labels/order come from main's canvas menu; project-only rows and private-card Analytics are omitted. Menu glyphs are the same Lucide names used by `CardMenu.jsx`, imported from `lucide-react@1.41.0` into `icons/home.svg`; its ISC/Feather notices are in `icons/home-NOTICE.txt`. Keep that attribution with exports. Folder colours are app data swatches, not new action palette colours.

Canvas opening, Sidebar Library/Explore/account destinations, Start completion and actual pin persistence are not connected to an app backend. Start opens the approved UI, accepts local source drafts, and closes on completion; it does not create a canvas. Search/notifications/feedback keep their existing local-sidebar specimen behavior. Do not treat this preview as a backend or persistence test. No explanatory preview banners are added to product UI.

## State references

- [Ready](clean/37-home.html)
- [Loading](clean/38-home-loading.html): shared spacious skeleton and shimmer; no visible loading prose or active card actions.
- [Error and Retry](clean/39-home-error.html): concise error, existing secondary Retry; retry goes through loading, then returns focus to an available card.
- [Empty](clean/40-home-empty.html): “No canvases yet.” with the existing Start action; no irrelevant size control.
- [Missing last topic](clean/41-home-no-topic.html): no fallback filler or reserved topic gap.

The state previews use fixtures; Retry simulates recovery locally. Production must bind the existing Home load request and report real failures. Do not convert unavailable data into the empty state.

## Verification

Run the existing build, clean export, portable library export and structural checks under `docs/ui/scripts`. See [Home verification](verification/home-verification.md) for the executed DOM checks and exact browser limitations. Browser verification remains pending: responsive grid/overflow, hover and touch options, native-dialog focus return and the screenshot composition require visual acceptance. Dark-theme tokens remain deferred. Update this handoff and the master index in the same push when the owner approves the draft.
