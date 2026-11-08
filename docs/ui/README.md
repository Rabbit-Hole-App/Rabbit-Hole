# Rabbit Hole UI assets

Start with the [searchable catalog](index.html), [complete source inventory](INVENTORY.md), [component-to-app mapping](MAPPING.md), and [review of inconsistencies and gaps](REVIEW.md).

This folder organizes the supplied card and interface references into **60 individually addressable component, card, and behavior entries**. It is the reference workspace for future UI updates. The application has not been restyled or deployed by this change.

## Separate HTML for feedback

The [clean folder](clean/) contains ten self-contained HTML files: six teaching cards, the composer, separate Markdown and PDF headers, and the green toggle. Each opens directly without a server or neighboring assets. Edit the component sources, then run `python docs/ui/scripts/export_clean.py` to refresh these exports. They omit catalog headings and review notes.

The four original kit compositions now use the shared resizable shell, preserving their scene and control nodes. This is an explicit composition change; original historical fixtures remain intact.

## Current design decisions

The latest owner correction selects the original `ca0affe` kit as the blue/Claude-red balance reference. [Palette roles and exact states](foundations/PALETTE.md) supersede the all-blue experiment controls in `aed6ce7`/`aa2cfb1`. Blue is for app actions, shared selection and playback. Warm red distinguishes experiment parameters/actions and Interactive identity. Most surfaces remain neutral. Accept stays blue and rectangular; Cancel stays secondary. Toggles are green when on and neutral when off, including experiment toggles. Preserve the latest typography and growing composer with its persistent footer and resize grip.

Precedence: latest owner decision → `foundations/PALETTE.md` and `tokens.json` → current component contract → preserved source. Historical examples preserve behavior and provenance; their styling is not automatically approved. All unresolved discrepancies are explicit in `REVIEW.md`.

## Folder map

| Path | Responsibility |
| --- | --- |
| `index.html` | Search names, source files, app paths, states, command names and issue IDs; filter by category. |
| `registry.json` | Generated machine-readable component index. |
| `sources.json`, `INVENTORY.md` | Every reviewed HTML input, aliases, provenance and supporting files. |
| `foundations/` | Canonical semantic color roles, exact tokens and the balanced palette overlay. |
| `components/controls/` | Buttons, fields, sliders, choices, switches, stepper, disclosure, timeline, filters, pills, toolbar. |
| `components/cards/` | Split Comparison, Decision Tracer, impurity metrics, split explorer, timed toss, bootstrap sampling. |
| `components/tutor/` | Composer, ToC, proposal acceptance, skeleton/loading, recovery, progress. |
| `components/sources/` | Markdown/PDF headers and source-selection actions. |
| `components/feedback/` | Tooltip, menu/popover, modal/Trash, toast, notification/comment specimens. |
| `components/layout/`, `components/navigation/` | Scroll-region and navigation specimens. |
| `components/icons/`, `icons/` | Per-glyph catalogs, state previews, shared SVG sprites and license notices. |
| `components/patterns/` | Preserved flows: source navigation, depth, term/follow-up interactions, roadmap, lifecycle, generation review, toss fixtures and original kit. |
| `templates/` | Shared DOM templates used by dynamic card/control previews. |
| `styles/`, `scripts/` | Shared extracted CSS and demo behavior; one copy per source family, not repeated inside every editable component. |
| `MAPPING.md`, `REVIEW.md`, `VERIFICATION.md` | Integration landmarks, unresolved decisions/missing UI, and evidence limits. |

Every component folder contains `component.json` (stable ID, role, origin, dependencies and app candidates), `markup.html` (editable fragment), generated `preview.html`, and generated `README.md`. Demo behavior is named in metadata and stored in `scripts/`; shared styling is in `styles/`. `foundations/palette.css` applies the explicit current color-role correction after imported styles.

## Open and search

From the repository root:

```sh
python -m http.server 8765 --directory docs/ui
```

Open `http://localhost:8765/`. Use a local server because SVG sprites are shared external files. Search examples: `composer`, `applicant`, `follow-up`, `term`, `UI-01`, `ProgramScene`, `slash`, `resize`, `dropdown`.

For code search: `rg "composer|applicant" docs/ui/components -g component.json`. The registry exposes the same data without depending on the HTML catalog.

## Change one component

1. Find its stable ID in the catalog or `MAPPING.md`.
2. Read its README, current palette role and linked review issues.
3. Edit its `markup.html`, the named shared script/style, or its metadata. Do not edit generated `preview.html`, per-component README, `registry.json`, `index.html` or `MAPPING.md` directly.
4. When changing shared CSS, review every consumer in the registry. A source-family stylesheet is not production CSS; map it onto existing React components later.
5. Run `python docs/ui/scripts/build.py`, `python docs/ui/scripts/export_clean.py`, and `python docs/ui/scripts/check.py`.
6. Perform browser visual/interaction acceptance through the project's approved workflow. Static checks do not establish that the app integration works.

Add a component by creating another folder with `component.json` and `markup.html`, using a neighboring entry as the schema example. Include actual dependencies, source, status, palette role, keywords, app landmarks and review IDs. Rebuild to make it searchable automatically.

## Preserved references and migration

The old handoff URLs remain intact. Their inventory maps into this folder; they are retained for history, feature-spec links and behavioral comparison. Future reference edits should happen here, with a pointer or explicit reconciliation in the old source when needed. Do not independently maintain two composer copies: this folder has one composer fragment, stylesheet and script.

The separate `decision-tree-card-templates.html` Library file is the resizable shell alias, differing only by trailing whitespace. The attached kit is an alias of original `ca0affe`, also differing only by trailing whitespace. Neither creates a duplicate canonical component set.

The 21 command pills are design inventory, not proof 21 commands are registered on this branch. Dropdown/stepper/disclosure and renderer-dependent controls also retain their capability limits. Full-screen composition, persistence, selection handlers and actual model generation remain integration work.

## Scope and delivery

Task: **Organize and review Rabbit Hole UI assets** · `a0a9e129-167c-44b6-b4e2-d2e8c53a5463`.

Baseline: `chatgpt/tutor` at `aa2cfb19a2ca551f2c99aad5cbbacf968c7b9f56`, plus supplied Library behavior fixtures and the original palette attachment. Only documentation/reference assets are changed. No runtime package, feature flag, model call or deployment is part of this task. Browser rendering remains unverified.
