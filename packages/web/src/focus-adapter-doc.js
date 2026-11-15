// Focus document (pinned-study-codebase-spec.md 2c, owner 2026-11-15): a Document card (the generated Runbook included) takes the working pane in place,
// up to WIDE_MAX. Focus only enlarges the card: typing, annotating and the generator's regenerate-in-place work as on the canvas, and a view-only
// viewer still sees it read-only (the card decides that, not Focus). The card's editor scrolls itself.
import { WIDE_MAX, fillBox, registerHostAdapter } from './focus-host.js';

registerHostAdapter({ kind: 'doc', label: 'Focus document', canFocus: block => block.type === 'doc', box: frame => fillBox(frame, { maxWidth: WIDE_MAX }) });
