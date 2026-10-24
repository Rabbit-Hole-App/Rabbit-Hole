// Focus table (docs/features/focus-study.md section 5, brief 3.3): the whole pane, so wide tables get their columns; rows
// and columns scroll inside the card at the normal text size.
import { fillBox, registerHostAdapter } from './focus-host.js';

registerHostAdapter({ kind: 'table', label: 'Focus table', canFocus: block => block.type === 'table', box: frame => fillBox(frame) });
