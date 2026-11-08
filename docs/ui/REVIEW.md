> Current review corrections and exact resize limits: [REVIEW-UPDATES.md](REVIEW-UPDATES.md). These supersede conflicting archived decisions below.

# Reference review: inconsistencies and missing UI

Reviewed the supplied HTML, the existing handoff files, lesson SVGs/README, relevant Explain/Interact spec sections, the pinned branch tree and selected runtime entry points. Sources are listed in [INVENTORY.md](INVENTORY.md). Latest palette correction is in [PALETTE.md](foundations/PALETTE.md). This is a source review; no browser visual acceptance or full runtime audit is claimed.

## Concrete inconsistencies

| ID | Finding and evidence | Decision / next action |
| --- | --- | --- |
| UI-01 | Standards still uses quiet Cancel: `rabbit-hole-interface-component-standards.html` lines 438–445, 673, 886, 901. | Owner explicitly chose secondary Cancel. Mapping contract follows owner; imported specimen remains flagged for reconciliation. Do not copy quiet Cancel blindly. |
| UI-02 | Kit control labels are 14 px at lines 56–57; select/numeric fields are 14 px at 86; disclosure label 13.6 px at 97. Shell applicant label is 14 px at 142. | Labels should be 13 px, message/field text 15 px. Keep readouts/details separate from labels. Palette correction does not silently change these source typography values. |
| UI-03 | Kit switch is 37×22 px with 16 px knob and #E2E8DF off surface; standards is 36×20 with 14 px knob and #E3E7E0 off surface. | Use standards geometry as the mapping candidate; reconcile kit before app adoption. Latest owner correction makes all toggle on-states green, including experiment toggles. |
| UI-04 | Icon-template neutral hover retains #5D675F; standards icon-only hover uses #202723. | Choose one shared neutral-hover token during implementation; both source examples are indexed, not asserted identical. |
| UI-05 | `explain.md` lines 144–160 retains #C15F3C term pills and round follow-up Send. Older toss/workflow fixtures also have dark cards, smaller titles and round buttons. | Preserve behavior, reconcile styling with current type/geometry and the new palette. Warm explanatory/data accents need a deliberate role; a historical pill does not make every app action red. |
| UI-06 | Source toolbar has Highlight / Explain / Add to chat; Explanation spec has Ask in chat / Highlight / Create note. Source-selection specimen has no action wiring. | These are different surfaces. Preserve linked-note and question flows; map each to the existing handlers rather than flattening them into one toolbar. |
| UI-07 | Dropdown, numeric stepper and disclosure say Register first; switch, ordered navigation and multi-select say Renderer dependent. ProgramScene on this branch renders numeric sliders and choice widgets plus actions/targets (lines 351–379). | Do not promise these controls to generation until that renderer's manifest/catalog/handlers support them. HTML prototype functionality is not registration. |
| UI-08 | Shell/card inventory allows captions, while Interact spec lines 63–64 and 149 prohibit explanatory prose below scenes/controls. | Retain optional Explanation captions. Keep Interactive teaching copy and Why above the scene; no explanatory footnotes below controls. |
| UI-09 | Composer grip now has a visible border in the persistent footer; teaching shell grip has a transparent resting border and an absolute corner position. | Latest composer-specific variant is intentional. Keep common glyph, dimensions and keyboard steps; document placement differences rather than forcing the composer back to an obscured corner. |
| UI-10 | Pinned branch slash.js has 20 public definitions and no `/interactive` entry, while the reference has 21 pills. `InteractCardContent.jsx` is absent from the aa2cfb1 tree; the supplied historical snapshot is from another commit. | This is a branch integration mismatch, not proof the feature is absent everywhere. Find the latest integrated renderer/registry before implementing; do not invent a path or add registration in this documentation task. |
| UI-11 | aa2cfb1 made experiment controls blue. Owner subsequently selected the original ca0affe kit for a better blue/red balance. | Current catalog overlays warm experiment rows/choices/actions, keeps app actions/playback blue and secondary actions neutral. Original and attached kit are preserved as one palette reference. This supersedes earlier all-blue rules. |

Line numbers refer to the reviewed source baseline, not generated previews. The old monoliths remain unchanged, so these findings remain visible rather than being hidden by extraction.

## Missing or incomplete reusable UI

| Area | What exists | What is still missing |
| --- | --- | --- |
| Teaching primitives | Metric tiles, readout, plotted toss, split scene and decision paths; lesson SVG sheets show further examples. | Dedicated component specimens for formula rows, numeric/data tables, callouts, paired bars, vote tiles and editable data grids. Do not mark an inventory label as a working reusable component. |
| Comparison patterns | Initial split comparison is a raster image; decision tracer is SVG. | Data-driven Split Comparison component with reusable panels/rows, not just the example picture. |
| Explanation actions | Older approved reference has terms, suggestions, Ask here/new card, same-card/branch thread and follow-up. | Current-palette isolated versions for each interaction and tested source/selection/linked-note wiring. Those behaviors are preserved under patterns/explanation-actions. |
| Full screens | Inventory landmarks for Canvas/Tutor, Home/navigation, Settings and Slash Commands. | Complete updated screen compositions and how shared components fit them. |
| Source types | Markdown/PDF headers and source-selection visuals. | Equivalent current specimens for link/repository/image source headers, source loading/error/empty states and file-info interactions where needed. |
| Generated-card contracts | Slot-based generated-card and generation-review HTML. | Host population, app event bindings, persistence and integration. Their previews intentionally show the contract, not invented functionality. |
| Controls | Core and prototype examples plus transport. | Renderer-specific registration, reset semantics across all inputs, controlled async pending/error states and keyboard behavior acceptance. |
| Accessibility/responsiveness | Focus and disabled styles, some labels, reduced-motion rules. | Browser checks for long labels, 320/440/Focus layouts, zoom, clipping, contrast, popover focus/return, scroll containment and resize with long drafts. |

## Behaviors preserved from older references

| Source | Keep for later mapping |
| --- | --- |
| 01-table-of-contents | Hierarchical add/edit/fold, manual completion and current section. |
| 02-canvas-card-skeleton | Pending → generating → delivered → next proposal; eligible Tab, Cancel and source jump. |
| 03-chat-roadmap | Scope/depth/mode, edit restoration, accepted roadmap and chat/ToC transitions. |
| 04-explanation-card | Historical source jump and supplementary disclosure; not the current style authority. |
| 05-markdown-source-links | Bidirectional prose/code/SVG/image/table navigation and local scroll reveal. |
| 06-explanation-depth | Overview/Standard/Deep, keyboard tabs and content-budget examples. |
| 07-explanation-card-approved | Term definitions, Dig Rabbit Hole, Ask here/new card, threads, follow-up and connector ports. Still referenced for behavior by explain.md. |
| 08-interactive-review | Summary, visual, takeaway, Generate/Edit. Static controls. |
| standard-toss-drop-card | Overview static; Standard signed peak-time toss/drop; Deep full-flight time and launch speed 3–5 m/s, step 0.1, default 5. |
| composition/complete workflow | Composition policy and generation/review workflow, not primitive components. |

## Runtime mapping limits

Existing paths were checked against the aa2cfb1 tree. ChatComposer, NextStepPill, ui.jsx, ProgramScene, slash.js and author-schema source were read for concrete entry points; other per-component links are source-backed landmarks, not a claim each renderer was audited end to end. Use the latest integrated versions when app work starts. No feature flags, registration, backend schema, generated-content schema or production UI was changed.
