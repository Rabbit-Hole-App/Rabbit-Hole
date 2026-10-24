// ponytail: Focus CAD model (docs/features/focus-study.md section 5, brief 3.3): container Focus only, the viewer box filling the pane
// with the camera untouched. Imported in focus-adapters.js: a focused CAD viewer counts as selected so Interact holds, and the
// CAD tools (Interact, Fit view, Show dimensions) sit in the Focus header beside Back to canvas (FocusFrame CadViewerTools).
import { fillBox, registerHostAdapter } from './focus-host.js';

registerHostAdapter({ kind: 'cad', label: 'Focus CAD model', canFocus: block => block.type === 'cad', box: frame => fillBox(frame) });
