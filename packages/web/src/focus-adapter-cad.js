// ponytail: Focus CAD model (docs/features/focus-study.md section 5, brief 3.3): container Focus only, the viewer box filling the pane
// with the camera untouched. NOT imported in focus-adapters.js yet (inventory: DEFERRED): enterFocus deselects the card, which
// ends CadPreview's Interact, and the CAD tools (Interact, Fit view, Show dimensions) live in the card's chrome row, which the
// shared [data-focus-host] rule hides, so a focused CAD model could not be orbited or framed. Import it once the seam keeps
// those tools in reach while focused.
import { fillBox, registerHostAdapter } from './focus-host.js';

registerHostAdapter({ kind: 'cad', label: 'Focus CAD model', canFocus: block => block.type === 'cad', box: frame => fillBox(frame) });
