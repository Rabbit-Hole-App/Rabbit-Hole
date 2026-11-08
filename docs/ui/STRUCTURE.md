# Organization and maintenance decisions

## Goal

Make each reference component findable, independently inspectable and straightforward to map to the app later. Preserve unique teaching/interaction flows and record uncertainty instead of making a screenshot or prototype imply runtime support.

## Chosen structure

Organize by UI responsibility under `components/`, with a stable ID and one metadata/markup source per entry. Extract shared CSS, scripts, templates and SVG sprites into shared directories. Generate the standalone previews, search catalog and app mapping from metadata. Keep original source paths intact, using the inventory as the migration map.

Alternatives considered: merely renaming the original monoliths would leave components hard to find; splitting every primitive into independent copies of CSS/JS would recreate the drift between composer variants. This structure keeps the original behaviors while giving each component an address and keeping its dependencies explicit.

## Constraints

- Preserve latest type sizes, geometry, composer scroll/footer behavior and keyboard resizing.
- Use the owner's new original-kit palette guidance: blue app/playback, warm experiment controls, neutral secondary actions; green toggles.
- Separate visual specimens, historical behavior fixtures and renderer/integration gaps.
- Do not remove source files or change application implementations.
- Keep current feature-spec links and icon license notices.
- Do not call a static or source-level check browser acceptance.

## Work completed

- [x] Read and inventory 19 current/related HTML inputs, plus original kit and attached alias.
- [x] Split component markup, shared CSS, scripts, templates and icons.
- [x] Add per-component metadata and app landmarks; preserve unique older flows.
- [x] Add searchable catalog, README, source inventory and review findings.
- [x] Apply explicit balanced-palette roles to current experiment specimens.
- [x] Run deterministic checks and record results in VERIFICATION.md.
- [x] Prepare reference assets for chatgpt/tutor without changing app runtime.

## Review focus

Missing DOM dependencies after extraction; runtime SVG references after externalizing symbols; duplicate IDs; source navigation links; preserving owner overrides while distinguishing renderer capability. The structural check covers the first four where statically inspectable. Real keyboard/scroll/focus/resize behavior and visual acceptance remain pending.
