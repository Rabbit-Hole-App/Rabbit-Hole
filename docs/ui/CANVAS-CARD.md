# Canvas summary cards

Read [RABBIT-HOLE-NEW-UI.md](RABBIT-HOLE-NEW-UI.md) first. This is the Home, Library and Explore canvas-summary reference, not a teaching card placed on the canvas.

[Complete HTML reference](clean/36-canvas-card.html) · [Searchable component](components/cards/canvas-summary/README.md)

## Owner decisions

- **Zero stars: show the star icon and “Star” only. Do not show `0`, an empty count badge, or its divider. Show the numeric count only when the total is greater than zero.** Keep the action enabled according to the app's existing permissions. Returning to zero hides the count again. Unknown/loading counts must not be invented as zero.
- A selected star is yellow. Use `aria-pressed` for selection. Visible and accessible labels must agree; the zero-count action is named “Star”.
- Descriptions sit below title/creator/visibility and above the actions. Use 15 px body text at every size. Preserve the full description; no line clamp, shrinking text or internal description scrollbar. Content determines height. An absent description has no paragraph or reserved gap. Do not substitute generic resume copy.
- Preserve four grid-size presets: Small 220 px (optional compact), Medium small 300 px (proposed default), Medium large 460 px, Large full row. Constrain the preset to its available viewport width; text must remain readable. These are grid cards, not draggable/resizable teaching cards, so they have no resize grip.
- Stack the thumbnail above content below 640 px card width. Reflow metadata below 352 px. Wider cards place the thumbnail on the right. The footer aligns with the thumbnail bottom when content fits, and flows below longer content when necessary. Do not reserve large blank content areas in stacked layouts.
- Private is a read-only neutral pill, not a dropdown. Omit the ambiguous blue ownership badge in this personal-card reference.
- Title, Continue and Enter on the focused card open it. The card body itself does not. Star and creator links act independently. Continue stays visible.

## Component map

| Element | Canonical source | Existing app landmark |
| --- | --- | --- |
| Shared summary shell and metadata | [canvas-card.html](templates/canvas-card.html), `.canvas-summary`, `.canvas-heading` in [canvas-card.css](styles/canvas-card.css) | `packages/web/src/home/LearningCard.jsx` |
| Four responsive sizes | `.canvas-card-frame`, container queries, `.size-example` in the same stylesheet | `packages/web/src/home/card-size.js`, `packages/web/src/index.css` |
| Optional description | `.canvas-note`; plain-text insertion in [canvas-card.js](scripts/canvas-card.js) | `LearningCard.jsx` description prop; render it directly in React |
| Star/count | `.button.secondary.ui-star`, `.star-count[hidden]`; script toggles count and hidden state together | `packages/web/src/CardStar.jsx`, `packages/web/src/StarButton.jsx` |
| Title and Continue | Shared `.link` and semantic primary tokens; `.canvas-title-link`, `.canvas-continue` | `LearningCard.jsx` open handlers |
| Private pill | Shared `.pill.neutral` and Lock glyph | `LearningCard.jsx` visibility metadata |
| Canvas, Star and Continue icons | [standards.svg](icons/standards.svg): Shapes, Star, ArrowRight; existing sizes/strokes | Existing app icons; preserve accessible action names |
| Thumbnail | `.canvas-thumbnail`; shared embedded image fixture in [canvas-card-examples.html](templates/canvas-card-examples.html) | `LearningCard.jsx` thumbnail slot |
| Colors and states | [palette.css](foundations/palette.css), [standards.css](styles/standards.css), [review-corrections.css](styles/review-corrections.css) | Shared app controls and theme |

The new reusable composition is the summary shell/thumbnail/counted-Star arrangement. It reuses the existing primitive buttons, links, pills, icon sprite and palette; it introduces no new control design or color family. Dark-theme tokens remain deferred.

## Example and production boundaries

The reference has twelve views: short, long and absent descriptions at each of four sizes. All include the same canonical card template; descriptions are host fixture text. The image is the owner's supplied screenshot displayed through a thumbnail viewport, not a generated lesson.

All twelve views represent variants of one demonstration canvas and share local Star state. Clicking Star shows a yellow selected star with count 1; clicking again hides the count and divider. In production, use the server's real total and selected state, synchronize views by canvas ID, preserve pending/error handling, and restore the prior state on failure. Do not infer total stars from the user's selection alone.

Demo navigation only announces to a screen-reader status region because no real canvas ID was supplied. Bind existing navigation callbacks during app integration. The creator link uses the supplied public handle. Review section titles and size labels belong to the specimen, not product cards.

## Editing and checks

Edit the canonical template, stylesheet, script and component record. Regenerate with:

```sh
python3 docs/ui/scripts/build.py
python3 docs/ui/scripts/export_clean.py
python3 docs/ui/scripts/export_library.py
python3 docs/ui/scripts/check.py
```

Update this document and the master index in the same push. The isolated preview is a UI reference; no runtime app changes or deployment are included. Offline structural and JavaScript checks cover the exported reference. The Star DOM fixture passed 0 → 1 → 0 across all twelve instances, including hiding the count and divider at zero. This is not browser evidence. Browser layout, keyboard interaction and real backend behavior remain unverified; inspect all sizes with long descriptions and both Star states before integration is considered complete.
