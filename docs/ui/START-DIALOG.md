# Start a rabbit hole

Scope: reusable HTML reference assets and local preview behavior. No app runtime, backend upload, repository connection, canvas creation, spec or deployment changes.

## Edit and map

| Component | Canonical HTML | Shared behavior | Separate clean preview |
| --- | --- | --- | --- |
| Files / Link / Repository tabs | [source-picker-tabs.html](templates/source-picker-tabs.html) | `scripts/source-widgets.js` | [Tabs](clean/13-source-picker-tabs.html) |
| Upload drop zone | [file-upload-drop-zone.html](templates/file-upload-drop-zone.html) | `scripts/source-widgets.js` | [Upload](clean/14-file-upload-drop-zone.html) |
| Added source row | [added-source-row.html](templates/added-source-row.html) | `makeSourceRow()` in `scripts/source-widgets.js` | [Source rows](clean/15-added-source-row.html) |
| Complete dialog | [start-rabbit-hole.html](templates/start-rabbit-hole.html) | `scripts/start-rabbit-hole.js` and shared widgets / resize | [Start a rabbit hole](clean/12-start-rabbit-hole.html) |

Each is registered in `components/sources/<name>/component.json`, with a preview and README. Search the catalog for start, source, upload, repository, remove or tabs. The complete dialog includes the other three templates at build time; it does not carry separate copies. Added source rows are cloned from their shared HTML template, with user values assigned through `textContent`.

App mapping: `packages/web/src/StartDialog.jsx` owns the existing start/source flow; `packages/web/src/ui.jsx` owns Button, Input and Tabs. These are integration landmarks, not a claim that the HTML is integrated. The real app has repository preparation, source policies and branch-selection behavior beyond this static preview; preserve those when mapping it later.

## Existing assets reused

- `styles/standards.css`: primary, secondary and quiet buttons, fields, icons, disabled/hover/pressed/focus states. Action labels add `white-space: nowrap`; shared `flex: none` prevents compression. Button height is 35 px, corners 8 px, labels 13 px and fields 15 px.
- `styles/review-corrections.css`: pale shared scrollbar and the existing 26 px resize grip, 14 px glyph, stroke 1.4 and hover/pressed/focus rules. The grip selector now also covers `.rh-start-dialog`; existing consumers retain their styling.
- `scripts/resize.js`: pointer and keyboard resize, including minimum and maximum limits. The dialog adds viewport bounds and a scrollable body; header and footer remain visible, text does not scale down.
- `icons/standards.svg`: Upload, Link2, FileText and X. `icons/icons.svg`: GitBranch. No hand-drawn replacement glyphs.
- `foundations/palette.css`: shared blue actions. This dialog does not introduce an experiment-red role.

The new source-pattern layout lives in `styles/source-picker.css`. Dialog composition lives in `styles/start-rabbit-hole.css`. The source tabs follow the app's existing underline-tab structure, with the current UI palette. The owner authorized creating these missing current templates on 2026-11-08.

## Interaction and copy contract

- Tabs switch source panels; they do not claim to add a source. Arrow keys and Home/End move between tabs.
- Browse files opens the file picker; files can also be dropped. Selection updates only the local draft.
- Add link / Add repository stay next to their inputs, retain single-line labels and use lower-emphasis buttons.
- Remove deletes one local draft row and restores keyboard focus to an adjacent Remove or the selected tab.
- Start stays at the right of the footer and is disabled until a source exists. The blank-canvas action is visible only with no sources and returns when the last source is removed.
- The empty-state guidance is “Add a source to start, or use a blank canvas.” Do not add the removed “One repository per rabbit hole.” helper sentence. The one-repository limit remains in behavior.
- Close and Escape close the preview; final actions explicitly report preview-only behavior rather than claiming a canvas was created.
- Each specimen is mounted once per document. Prefix IDs if multiple copies are needed in the app; the existing library isolates specimens in separate frames.

## Build and evidence

Run from the repository root:

```sh
python docs/ui/scripts/build.py
python docs/ui/scripts/export_clean.py
python docs/ui/scripts/export_library.py
python docs/ui/scripts/check.py
```

The shared include resolver also supplies searchable markup to the catalog and portable library. Generated exports embed the same styles, behavior and SVG symbols and do not require a server or external assets. Static validation checks dependencies, IDs, accessibility references, symbols and JavaScript syntax. Browser rendering, actual pointer layout and app integration remain unverified; the owner requested HTML review without opening a browser.
