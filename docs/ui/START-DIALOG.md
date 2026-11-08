# Start a rabbit hole

Scope: reusable HTML reference assets and local preview behavior. No app runtime, backend upload, repository connection, canvas creation, spec or deployment changes.

## Claude Code implementation handoff

Use this document as the component bill of materials for the **Start a rabbit hole** card/dialog. It specifies what to reuse and where every visible element comes from. Do not recreate the screen from a screenshot or use the old dark screenshot as the styling source.

### Visual reference to match

- **Complete standalone reference:** [12-start-rabbit-hole.html](clean/12-start-rabbit-hole.html). This is the assembled UI to inspect for placement, typography, spacing and control states.
- **Editable composition:** [templates/start-rabbit-hole.html](templates/start-rabbit-hole.html). Its include directives identify the actual subtemplates used.
- **Component record and dependencies:** [sources/start-rabbit-hole/component.json](components/sources/start-rabbit-hole/component.json).
- **Library entry:** [Start dialog preview](components/sources/start-rabbit-hole/preview.html). Browse the [component library](rabbit-hole-component-library.html) or [searchable catalog](index.html) for the related specimens.
- **Pinned handoff reference:** [HTML at 8b75e21](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/8b75e216c0dc54088048d471ee621bf421a07440/docs/ui/clean/12-start-rabbit-hole.html), including the Files focus correction. Template addition: [1a4d2e8](https://github.com/Rabbit-Hole-App/Rabbit-Hole/commit/1a4d2e8edc54959a0594dc0a8f4835b5438a99c7). Focus correction: [8b75e21](https://github.com/Rabbit-Hole-App/Rabbit-Hole/commit/8b75e216c0dc54088048d471ee621bf421a07440).

### Provenance: existing versus newly authorized

The first draft reused tokens but also contained custom source-entry styling. It was not an exact assembly of pre-existing templates. The owner subsequently authorized creating the four missing templates, which were added to this library and then used to rebuild the screen. Do not describe those four patterns as having existed before that authorization.

The current implementation reuses existing primitives and the newly registered source templates below. The complete dialog has its own documented composition (`.rh-start-dialog`); it is not a verbatim copy of the teaching-card DOM. Its shared control, scrollbar and resize rules remain owned by the existing library sources.

### Every visible component and its source

All paths below are relative to `docs/ui/`. The selectors are the ones used by the current reference, not proposed replacements.

| Visible element | Component / selector in this dialog | Exact library source to reuse | Provenance |
| --- | --- | --- | --- |
| Full frame and header/body/footer placement | `sources/start-rabbit-hole`; `.rh-start-dialog`, `.start-header`, `.start-body`, `.start-footer` | [Dialog template](templates/start-rabbit-hole.html), [composition CSS](styles/start-rabbit-hole.css), [record](components/sources/start-rabbit-hole/component.json) | Newly authorized composition |
| Title and description | `.start-header h1`, `.start-header p` | [Composition CSS](styles/start-rabbit-hole.css); [font/token reference](foundations/tokens.json); [design-values specimen](components/foundations/card-design-values/preview.html) | Existing text roles applied in the new composition |
| Files / Link / Repository | `sources/source-picker-tabs`; `.source-tabs`, `.button.source-tab` | [Tabs template](templates/source-picker-tabs.html), [source-pattern CSS](styles/source-picker.css), [preview](components/sources/source-picker-tabs/preview.html) | Newly authorized current template; app `TabsList`/`TabsTrigger` supplies the underline-tab structure |
| Selected underline and keyboard focus | `[aria-selected="true"]::after`, `.source-tab:focus-visible` | [Source-pattern CSS](styles/source-picker.css); shared focus color/width from [standards.css](styles/standards.css) | New tab layout with existing focus tokens |
| Drop area and Browse files | `sources/file-upload-drop-zone`; `.source-upload`, `.dropzone`, `.button.secondary.browse-label` | [Upload template](templates/file-upload-drop-zone.html), [source-pattern CSS](styles/source-picker.css), [preview](components/sources/file-upload-drop-zone/preview.html) | Newly authorized pattern composed with the existing secondary button style |
| Link / Repository URL labels and inputs | `.source-entry`, `.source-input-row`, `.control` | [Text-field specimen](components/controls/text-fields/markup.html), [standards.css](styles/standards.css); layout in [source-picker.css](styles/source-picker.css) | Existing field primitive; new source-entry arrangement |
| Add link and Add repository | `.button` within `.source-input-row` | [Button hierarchy](components/controls/buttons/markup.html), [standards.css](styles/standards.css); nowrap rule in [source-picker.css](styles/source-picker.css) | Existing neutral action buttons |
| Start rabbit hole | `.button.primary` | [Button hierarchy](components/controls/buttons/markup.html), [standards.css](styles/standards.css), [palette overlay](foundations/palette.css) | Existing primary button |
| Start with a blank canvas | `.button` in `.start-footer` | [Button hierarchy](components/controls/buttons/markup.html), [standards.css](styles/standards.css) | Existing lower-emphasis button |
| Close and Remove | `.icon-button.quiet` | [Icon toolbar specimen](components/controls/icon-toolbar/markup.html), [standards.css](styles/standards.css), [X symbol](icons/standards.svg#i-X) | Existing quiet icon-button primitive |
| Added source row, name and detail | `sources/added-source-row`; `.source-row`, `.source-info`, `.source-name`, `.source-kind` | [Row template](templates/added-source-row.html), [source-pattern CSS](styles/source-picker.css), [preview](components/sources/added-source-row/preview.html) | Newly authorized row pattern; existing icons and Remove control |
| Empty-source guidance | `.start-body .empty` | [Dialog template](templates/start-rabbit-hole.html), [composition CSS](styles/start-rabbit-hole.css) | Owner-reviewed copy and placement in the new composition |
| Field validation message | `.source-entry .error`, `role="alert"`, `aria-invalid` | [Field validation specimen](components/controls/text-fields/markup.html), [source-pattern CSS](styles/source-picker.css), danger token in [standards.css](styles/standards.css) | Existing field-error pattern applied to source inputs |
| Scrollbar | Shared scrollbar selectors | [review-corrections.css](styles/review-corrections.css), [scroll-region specimen](components/layout/scroll-region/preview.html) | Existing pale shared scrollbar |
| Bottom-right resize grip | `.rh-start-dialog .resize-handle` | Shared grip rules in [review-corrections.css](styles/review-corrections.css); canonical glyph in [review-corrections.js](scripts/review-corrections.js); [resize behavior](scripts/resize.js) | Existing grip, glyph and behavior; selector extended to this dialog |
| Hover / pressed / disabled / focus states | `.button`, `.icon-button`, `.control`, `:focus-visible`, `:disabled` | [standards.css](styles/standards.css), with the explicit source-tab/drop-zone rules in [source-picker.css](styles/source-picker.css) | Existing primitive states plus documented states for the new patterns |
| Warm surfaces and blue app actions | CSS custom properties | [standards.css](styles/standards.css), [palette.css](foundations/palette.css), [tokens.json](foundations/tokens.json) | Existing palette; `tokens.json` is a reference, not a runtime CSS import |

The Browse files visual is a non-interactive span inside the single drop-zone button; do not turn it into a nested button. Close and Remove currently have native `title` hints. A custom floating tooltip is not implemented by this reference; do not assume a different tooltip component was used.

### Exact icon inventory

Use the library SVG symbols or the matching existing Lucide icon components. Do not draw approximate substitutes.

| Use | Symbol / glyph | Reference |
| --- | --- | --- |
| Files tab and drop area | `i-Upload` | [standards.svg](icons/standards.svg#i-Upload) |
| Link tab and link source row | `i-Link2` | [standards.svg](icons/standards.svg#i-Link2) |
| Repository tab and repository row | `icon-GitBranch` | [icons.svg](icons/icons.svg#icon-GitBranch) |
| File source row | `i-FileText` | [standards.svg](icons/standards.svg#i-FileText) |
| Close and Remove | `i-X` | [standards.svg](icons/standards.svg#i-X) |
| Resize | Existing two diagonal strokes, `M3 12 12 3M8 12 12 8` | [Shared grip source](scripts/review-corrections.js) |

Regular icons use the shared `.icon` rules in `standards.css` (16 px, stroke 2). The grip uses its existing 14 px glyph, stroke 1.4, inside a 26 px control with 7 px corners. The exported HTML embeds these symbols; the editable source refers to the shared sprites.

### Assembly and behavior dependencies

The exact dependencies are recorded in [component.json](components/sources/start-rabbit-hole/component.json):

1. CSS loads `styles/standards.css`, `styles/review-corrections.css`, `styles/source-picker.css`, `styles/start-rabbit-hole.css`, then `foundations/palette.css`. The first two supply existing primitives; the next two supply the authorized source patterns and composition.
2. [source-widgets.js](scripts/source-widgets.js) owns tab selection/keyboard navigation, file-picker/drop events and `makeSourceRow()` cloning the shared row template. It also supplies isolated specimen demonstrations.
3. [resize.js](scripts/resize.js) owns `installResize()` and bounds. Do not copy its logic into a new resizing implementation.
4. [start-rabbit-hole.js](scripts/start-rabbit-hole.js) owns the local draft, input validation, source removal, Start/blank visibility, initial title focus, focus containment and preview-only completion.
5. [ui_fragments.py](scripts/ui_fragments.py) resolves the canonical HTML includes for [build.py](scripts/build.py), [export_clean.py](scripts/export_clean.py) and [export_library.py](scripts/export_library.py). Generated files are outputs, not separate editable designs.

The preview-only result screen and the isolated row specimen's Restore examples button demonstrate local behavior. They are not product requirements and must not be copied into the application flow.

### Implementation rules for Claude Code

1. Read the repository's current `AGENTS.md`, `CLAUDE.md` and `UI.md`, this handoff, and the complete HTML reference before changing app UI. The owner's latest explicit decisions override older design files.
2. Modify the existing [StartDialog.jsx](../../packages/web/src/StartDialog.jsx) and reuse [ui.jsx](../../packages/web/src/ui.jsx) Button, Input and Tabs where applicable. Use the latest integrated app code; these links are mapping landmarks. Do not create a second Start flow.
3. Map each visible element to the table above. Match the reference using shared app components and the named library assets. When an app primitive needs the current reference styling, extend the shared primitive deliberately rather than styling a duplicate inside this dialog.
4. Preserve existing upload, repository preparation, branch selection, source inclusion, access, loading, error and canvas-creation behavior. The HTML simulates only a local draft; do not replace real behavior with its demo callbacks. Any extra runtime UI absent from this reference is a mapping gap to identify, not permission to invent a visual.
5. Keep Add link / Add repository labels on one line: buttons do not shrink, input fields absorb the available width. Preserve button height, radius and states from the shared rules. Do not shrink text to make controls fit.
6. Keep the reviewed copy and interactions in the contract below. In particular, remove the repository helper sentence, retain empty-source guidance, focus the title on opening, preserve keyboard focus rings, and keep Start aligned right.
7. If a component/state is missing, stop work on that missing piece and tell the owner exactly what is missing. Continue independent work already covered by these templates. Obtain direction before inventing a replacement; add any newly authorized reusable template to `docs/ui` before using it.
8. Verify real app interactions and rendering through the approved workflow. Report layout, focus, resize, overflow, enabled/disabled, errors and source-removal evidence separately from structural checks. Do not claim this HTML already proves production behavior.
9. In the implementation hand-back, list each reused component, any shared component change, any remaining mapping gap, the exact commit and tests actually performed. Preserve this file as the reference map when the UI evolves.


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

- Initial modal focus goes to the title. Files starts selected with an underline, without an automatic button focus ring. Keyboard focus rings remain visible inside the tab bounds.
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
