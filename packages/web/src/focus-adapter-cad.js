// ponytail: Focus CAD model (docs/features/focus-study.md section 5, brief 3.3): container Focus only, the viewer box filling the pane
// with the camera untouched. NOT imported in focus-adapters.js yet: the seam keeps a focused CAD viewer selected so Interact holds, and the
// CAD tools (Interact, Fit view, Show dimensions) sit in the Focus header (FocusFrame CadViewerTools), but no check exercises them with a real 3D asset. Import it once one does.
import { fillBox, registerHostAdapter } from './focus-host.js';

registerHostAdapter({ kind: 'cad', label: 'Focus CAD model', canFocus: block => block.type === 'cad', box: frame => fillBox(frame) });
