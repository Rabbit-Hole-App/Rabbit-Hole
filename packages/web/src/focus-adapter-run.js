// Focus run card (pinned-study-codebase-spec.md 2c, docs/features/focus-study.md section 5): the Run card's own host fills the working pane up to
// WIDE_MAX, restyled in place like the notebook's (focus-host.js). Never moved, cloned or remounted, so the card's sandbox session, its running
// cells and its typed values stay as they are while Study switches tabs. Its tabs, cells and outputs scroll inside the card at normal text size.
import { WIDE_MAX, fillBox, registerHostAdapter } from './focus-host.js';

registerHostAdapter({ kind: 'run', label: 'Focus run card', canFocus: block => block.type === 'run', box: frame => fillBox(frame, { maxWidth: WIDE_MAX }) });
