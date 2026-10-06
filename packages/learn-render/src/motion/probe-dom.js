// The frame probe's measurement (harness code, never Author code), shared by both renderers so the
// coverage and font rules judge them identically: the Remotion stage calls it from probe.jsx; the
// HyperFrames renderer evaluates it in the page after each seek (M7B). It reports the storyboard
// objects (data-object) and the text a viewer can actually see, with the font each text renders in.
// Self-contained (no imports, no closures) so it can be serialized into a page. originRect is the
// stage's top-left: Remotion parks its page off-screen; HyperFrames passes null (the composition root).
export function probeDom(frame, originRect) {
  const STAGE_W = 1920, STAGE_H = 1080;
  const opacity = el => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return 0; o *= Number(s.opacity); } return o; };
  const squash = s => s.replace(/\s+/g, ' ').trim();
  const o = originRect || document.querySelector('[data-composition-id]').getBoundingClientRect();
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
    if (!value || !el || ['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(el.tagName)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const op = opacity(el);
    if (op <= 0.05 || !onStage(range.getBoundingClientRect())) continue;
    // within: every enclosing object, nearest first (a label nested in a code panel is inside that panel)
    const within = [];
    for (let x = el.closest('[data-object]'); x; x = x.parentElement?.closest('[data-object]')) within.push(x.getAttribute('data-object'));
    text.push({ value: value.slice(0, 300), opacity: +op.toFixed(3), font: getComputedStyle(el).fontFamily, object: within[0] ?? null, within });
  }
  return { frame, objects, text };
}
