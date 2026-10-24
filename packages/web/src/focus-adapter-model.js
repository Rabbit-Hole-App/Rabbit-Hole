// Focus 3D model (docs/features/focus-study.md section 5, brief 3.3): container Focus for an imported model (ModelCard).
// The viewer box takes the whole pane and the renderer follows it (its own ResizeObserver); the camera is untouched. Its
// Interact and Fit buttons are in the card's own header, so they stay in reach; Fit is never called from here.
import { fillBox, registerHostAdapter } from './focus-host.js';

registerHostAdapter({ kind: 'model', label: 'Focus 3D model', canFocus: block => block.type === 'file' && block.kind === 'model', box: frame => fillBox(frame) });
