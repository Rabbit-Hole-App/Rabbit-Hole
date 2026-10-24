// Focus note (docs/features/focus-study.md section 5, brief 3.3): a sticky note or text box (canvas items, not blocks) in a
// readable column at its own text size, on a surface, scrolling inside. Editing it while focused saves as usual.
import { READING_MAX, fillBox, registerHostAdapter } from './focus-host.js';

registerHostAdapter({
  kind: 'note', label: 'Focus note',
  canFocus: object => !object.type && (object.kind === 'sticky' || (object.kind === 'text' && object.mode !== 'code')),
  box: frame => fillBox(frame, { maxWidth: READING_MAX }),
});
