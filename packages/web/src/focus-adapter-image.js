// Focus image and Focus page (docs/features/focus-study.md section 5, brief 3.3): the picture at its own aspect ratio, as
// large as the pane allows with its title and caption, never cropped. A PDF page added as a slide is the same picture.
import { contain, registerHostAdapter } from './focus-host.js';

// The card's picture, not a search result thumbnail (ImageBody lists those under it).
const box = (frame, host) => contain(frame, host, [...host.querySelectorAll('img')].find(img => !img.closest('[data-photo-result]')));

registerHostAdapter({
  kind: 'image', label: 'Focus image', again: true, box,
  canFocus: block => block.type === 'image' || (block.type === 'file' && ['image', 'svg'].includes(block.kind) && !block.excerpt),
});
registerHostAdapter({ kind: 'slide', label: 'Focus page', again: true, box, canFocus: block => block.type === 'slide' });
