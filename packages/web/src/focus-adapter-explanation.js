// Focus explanation (docs/features/focus-study.md section 5, brief 3.3): text at its normal size in a readable column that
// scrolls inside the card. An animated Explanation (type animation, no scroll body) takes the whole pane: its scene follows
// the frame's aspect without cropping, and its playback is the scene's own state.
import { READING_MAX, fillBox, registerHostAdapter } from './focus-host.js';

registerHostAdapter({
  kind: 'explanation', label: 'Focus explanation',
  canFocus: block => block.type === 'explanation' || block.type === 'animation',
  box: (frame, host) => fillBox(frame, { maxWidth: host.querySelector(':scope > [data-scroll]') ? READING_MAX : Infinity }),
});
