// The Author proof's frame probe (harness code, never Author code): once the frame is laid out
// with its fonts, log one MOTION_PROBE line with the storyboard objects (data-object) and the
// text a viewer can actually see, with the font each text renders in. It holds the frame with
// delayRender until it has measured, and draws nothing. Positions are measured from a zero-size
// marker at the stage origin, because Remotion parks the page off-screen while it prepares.
import { useLayoutEffect, useRef } from 'react';
import { continueRender, delayRender, useCurrentFrame } from 'remotion';

const STAGE_W = 1920, STAGE_H = 1080;
const opacity = el => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return 0; o *= Number(s.opacity); } return o; };
const squash = s => s.replace(/\s+/g, ' ').trim();

export const Probe = () => {
  const frame = useCurrentFrame();
  const origin = useRef(null);
  useLayoutEffect(() => {
    const handle = delayRender('probe');
    document.fonts.ready.then(() => requestAnimationFrame(() => {
      const o = origin.current.getBoundingClientRect();
      const onStage = r => r.width > 0 && r.height > 0 && r.right - o.left > 0 && r.bottom - o.top > 0 && r.left - o.left < STAGE_W && r.top - o.top < STAGE_H;
      const objects = [...document.querySelectorAll('[data-object]')].map(el => ({
        id: el.getAttribute('data-object'),
        opacity: +opacity(el).toFixed(3),
        // an object is its element and everything inside it (a wrapper of absolute children has no box of its own)
        on_stage: [el, ...el.querySelectorAll('*')].some(x => onStage(x.getBoundingClientRect())),
        text: squash(el.textContent || '').slice(0, 600),
      }));
      const text = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const value = squash(n.nodeValue || '');
        const el = n.parentElement;
        if (!value || !el) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const op = opacity(el);
        if (op <= 0.05 || !onStage(range.getBoundingClientRect())) continue;
        text.push({ value: value.slice(0, 300), opacity: +op.toFixed(3), font: getComputedStyle(el).fontFamily, object: el.closest('[data-object]')?.getAttribute('data-object') ?? null });
      }
      console.log('MOTION_PROBE ' + JSON.stringify({ frame, objects, text }));
      continueRender(handle);
    }));
  });
  return <div ref={origin} style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }} />;
};
