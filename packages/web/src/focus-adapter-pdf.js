// Focus PDF (docs/features/focus-study.md section 5, brief 3.2): the reader takes the whole working pane in place. A paper
// card's page is the scroller's width at zoom 1 (LearnPaper), so it fits the new width at once; the PDF card's own viewer
// refits by its own zoom mode. Page, scroll, zoom, selection and both readers' page and zoom controls are left as they are,
// and a long document scrolls inside the reader instead of shrinking to fit vertically.
import { fillBox, registerHostAdapter } from './focus-host.js';

registerHostAdapter({
  kind: 'pdf', label: 'Focus PDF',
  canFocus: block => block.type === 'pdf' || (block.type === 'paper' && !!block.paper?.id),
  box: frame => fillBox(frame),
});
