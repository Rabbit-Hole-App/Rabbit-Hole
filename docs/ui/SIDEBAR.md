# Sidebar and utility panels

Use this handoff with [RABBIT-HOLE-NEW-UI.md](RABBIT-HOLE-NEW-UI.md). This is the owner-reviewed UI reference for the left sidebar and the Search, Trash, Notifications and Feedback surfaces. It does not change runtime behavior or authorize deployment. Inspect the latest integrated app before implementing.

## Review references

| Surface | Clean HTML | Editable template | Searchable component |
| --- | --- | --- | --- |
| Complete sidebar | [16-sidebar.html](clean/16-sidebar.html) | [sidebar.html](templates/sidebar.html), [sidebar-shell.html](templates/sidebar-shell.html) | `navigation/sidebar` |
| Search, initially open | [17-sidebar-search.html](clean/17-sidebar-search.html) | [sidebar-search.html](templates/sidebar-search.html) | `navigation/sidebar-search` |
| Trash, initially open | [18-sidebar-trash.html](clean/18-sidebar-trash.html) | [sidebar-trash.html](templates/sidebar-trash.html) | `navigation/sidebar-trash` |
| Notifications, initially open | [19-sidebar-notifications.html](clean/19-sidebar-notifications.html) | [sidebar-notifications.html](templates/sidebar-notifications.html) | `navigation/sidebar-notifications` |
| Feedback, initially open | [20-sidebar-feedback.html](clean/20-sidebar-feedback.html) | [sidebar-feedback.html](templates/sidebar-feedback.html) | `navigation/sidebar-feedback` |

The four panel previews include the sidebar so positioning, trigger states, close behavior and feedback confirmation can be reviewed in context. They resolve the same canonical fragments, not separately maintained copies. Use the catalog or portable component library to search their IDs, labels and app paths.

## Exact component map

Paths below are relative to `docs/ui/`. Reuse these primitives; do not substitute visually similar controls.

| Visible part | Existing shared source | Composition or binding |
| --- | --- | --- |
| Warm surfaces, ink, blue selection, green completion | `foundations/palette.css`, `styles/standards.css` | `styles/sidebar.css` only arranges the shell and panels |
| Navigation rows and selected state | `components/navigation/navigation`, `.menu-item` | `.sidebar-row`, `.sidebar-group`; `aria-current="page"` |
| Account avatar | `.avatar` in `styles/review-corrections.css` | `.account-trigger`, `.account-label` |
| Collapse, close and Recent controls | `components/controls/icon-toolbar`, `.icon-button.quiet` | Shared keyboard-focus and hover states |
| Account menu | `components/feedback/menu-popover`, `.menu`, `.menu-item`, `.menu-divider` | Settings and Log out labels from app |
| Tooltips | `components/feedback/tooltip`, `.tooltip` | Viewport-positioned; 400 ms delay; focus and hover |
| Search and feedback fields | `components/controls/text-fields`, `.field`, `.control` | Search input; visible feedback label and textarea |
| Restore, Submit and feedback choices | `components/controls/buttons`, `.button.secondary`, `.button.primary`, `.button.quiet` | Two choices use `aria-pressed`; no native select |
| Search and Trash overlays | `components/feedback/menu-popover`, `.dialog`, `dialog::backdrop` | Native modal dialogs; header, scrolling body and close action |
| Notifications and Feedback surfaces | `components/feedback/menu-popover`, `.popover` | Floating panels positioned beside sidebar where space permits |
| Notification and unread count | `components/feedback/notifications-comments`, `.notification`, `.count-badge` | Existing Maya reply specimen; Claude-red count |
| Scrollbars | `styles/review-corrections.css` | Shared pale thumb and track; no custom dark scrollbar |
| Icons already in library | `icons/standards.svg` | Bell, Shapes, Trash2, MessageSquare, ChevronDown, X, Check |
| Sidebar icons newly added to sprite coverage | `icons/sidebar.svg`, `icons/NOTICE.txt` | Lucide house, search, library, compass, panel-left-close/open, settings, log-out; same glyph family used by app |

Shared stylesheet order is `standards.css`, `review-corrections.css`, `sidebar.css`, then `foundations/palette.css`. Scripts are `scripts/sidebar.js` and `scripts/sidebar-panels.js`. Canonical includes are resolved by `scripts/ui_fragments.py`.

## Newly composed templates

The existing library supplied the primitives above, but did not contain a complete sidebar shell, account header, Recent list, collapsed rail, sidebar edge resizing, or these four complete utility surfaces. These are now explicit templates with searchable component records. They adapt existing app structures instead of establishing a second icon, palette or control system.

App mapping landmarks inspected for this reference: `packages/web/src/Sidebar.jsx` (navigation, account, Recent, Notifications and TrashDialog), `packages/web/src/Search.jsx` (SearchModal), and `packages/web/src/FeedbackButton.jsx` (bug/idea form and submission lifecycle). The inspected app snapshot was `39d19f2`; re-read the latest implementation and its callers before changing runtime code.

## Sidebar contract

- Default width 300 px, edge-resizable from 200 to 400 px; collapsed rail 64 px. Keep text sizes fixed and truncate long row names with ellipsis.
- The sidebar has an account header; Search and Notifications; Home, Library and Explore; Recent canvases; pinned Trash and Feedback footer.
- Only the middle content scrolls. Footer actions remain available. This navigation shell uses the existing app's side-edge resize interaction; it is not a teaching card and does not introduce a competing bottom-right card grip.
- Resize with pointer or keyboard arrows (10 px; Shift 40 px), Home for minimum and End for maximum. Respect reduced motion.
- Selected navigation uses the shared blue treatment. Notifications use a Claude-red count. Successful feedback uses green.
- Recent collapse control appears on hover/focus and stays available on touch. Collapsed rail has accessible labels and tooltips.
- Account menu supports Escape, arrows, Home/End and focus return. Settings and Log out in this HTML are placeholders, not real account operations.

## Panel contract

| Panel | Placement and opening | Content and interaction | Closing |
| --- | --- | --- | --- |
| Search | Centered modal; focus search field; Ctrl/Cmd+Shift+F outside a text field | Sample canvas title filtering, type labels, empty result state; arrows browse and Enter selects | X, Escape or backdrop; return focus to trigger or selected recent row |
| Trash | Centered modal | Deleted canvas rows, deletion time, secondary Restore action; concise empty state after last restore | X, Escape or backdrop |
| Notifications | Floating beside sidebar, top-aligned; fit inside narrow viewport | Existing notification specimen, Claude-red unread count, Clear notifications and caught-up state; opening clears unread badge | X, Escape or outside press |
| Feedback | Floating beside sidebar, bottom-aligned; focus textarea | Report a bug / Suggest a feature; visible field label; max 2,000 characters; Submit disabled for blank input | X, Escape or outside press; successful submit closes it |

One utility surface opens at a time. Preserve focus containment, labels, keyboard behavior, active trigger states and pale scrollbars. Panels are content-sized, bounded by the viewport and scroll internally when needed.

### Feedback after Submit

1. Change Submit to `Submitting…`; disable duplicate submission and form editing while pending.
2. On success, close the panel and clear the draft. Briefly replace the Feedback glyph with a green checkmark for 2.5 seconds. Announce success accessibly and restore the normal Feedback state afterward. Do not add a persistent success paragraph or a corner toast.
3. The HTML simulates success after 500 ms. No network request is sent. This delay is a specimen mechanism, not a production requirement.
4. Production must keep the existing `FeedbackButton.jsx` request, diagnostics, support reference and failure handling. On failure, keep the draft and show a concise actionable error/retry state. The failure appearance is not exercised by this success-only HTML; do not claim error-state visual acceptance or replace the API with a timer.

## Copy rules from owner review

Follow the master handoff's concise-copy rule. Titles, labels and actions should explain themselves. Supporting text must convey a necessary action, consequence, constraint or recovery step.

Removed from the UI:

- `Restore a canvas to your library.`
- `Sample items · Changes last until you reload this preview.`
- `Preview only · Feedback is not sent.`
- Sample-library and sample-notification footer labels.

Keep demonstration limitations in this handoff and review messages, not in the product UI. Remove empty footer containers. Accessible labels and live announcements are still required.

## Demonstration boundaries and remaining gaps

- HTML uses local canvas names, deleted items and the library's Maya reply specimen. Search selects local rows; it does not open a real canvas. Restore removes a sample trash row and adds it to the sample search list. Clear notifications changes local state only. Reload resets these samples.
- Real search, retention rules, restore permissions, notification data/read state and feedback API integration remain app responsibilities. Do not infer retention policy from the absence of a footer; preserve applicable real behavior.
- The app snapshot's notification data is different from the illustrative comment notification. The specimen does not establish a new notification event backend.
- Loading, network failure and permission-denied states for panels are not fully covered by this reference. Reuse existing handling and identify any missing visual states before inventing them.
- No runtime files were changed. No browser layout or interaction verification is claimed. The owner reviewed the HTML; programmatic structural checks are separate evidence.

## Edit and regenerate

Edit `templates/sidebar*.html`, `styles/sidebar.css`, `scripts/sidebar.js`, `scripts/sidebar-panels.js` and component metadata. Then run from the repository root:

```sh
python3 docs/ui/scripts/build.py
python3 docs/ui/scripts/export_clean.py
python3 docs/ui/scripts/export_library.py
python3 docs/ui/scripts/check.py
node --check docs/ui/scripts/sidebar.js
node --check docs/ui/scripts/sidebar-panels.js
```

Generated previews, registry, catalog, mapping and clean HTML must not become independently edited design sources. Validate the new SVG/ARIA targets and absence of external dependencies in clean exports. The feedback handler was exercised without a browser for pending-state locking, duplicate prevention, close, draft clearing, green check and timed reset.
