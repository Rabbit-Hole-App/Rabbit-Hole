// Focus video (docs/features/focus-study.md section 5, brief 3.3): a Motion or other clip at its own aspect ratio, never
// cropped, resized in place so playback carries on. A YouTube moment (an iframe that letterboxes itself) and a clip not
// generated yet take the whole pane.
import { contain, registerHostAdapter } from './focus-host.js';

registerHostAdapter({
  kind: 'video', label: 'Focus video', again: true,
  canFocus: block => block.type === 'video' || (block.type === 'file' && block.kind === 'clip'),
  box: (frame, host) => contain(frame, host, host.querySelector('video')),
});
