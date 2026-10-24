// Motion's font loader: the package's own woff2 files (assets/fonts, sha256-pinned in
// FONT_PINS), never a system or network font. Holds the render until every face is in
// document.fonts, cancels it on any failure, then logs one MOTION_FONTS line as evidence.
import { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';

const FACES = [
  ['Inter', 'Inter-Regular.woff2', '400'],
  ['Inter', 'Inter-Medium.woff2', '500'],
  ['Virgil', 'Virgil.woff2', '400'],
  ['JetBrains Mono', 'JetBrainsMono-Regular.woff2', '400'],
];

// Returns true once every face is in document.fonts. The stage mounts its content only then (index.jsx), so the content is
// painted once, with its final fonts: a first paint in a fallback font followed by a repaint after the swap made translucent
// layers under the text rasterize differently from page to page (the validation fixture's determinism failures). The
// render is held until that mounted frame has committed, so a still never captures the empty page.
export const useMotionFonts = () => {
  const [handle] = useState(() => delayRender('loading Motion fonts'));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const faces = FACES.map(([family, file, weight]) => new FontFace(family, `url('${staticFile(`fonts/${file}`)}') format('woff2')`, { weight }));
    Promise.all(faces.map(f => f.load()))
      .then(loaded => {
        loaded.forEach(f => document.fonts.add(f));
        console.log('MOTION_FONTS ' + JSON.stringify({
          faces: loaded.map(f => ({ family: f.family, weight: f.weight, status: f.status })),
          check: document.fonts.check('400 32px "JetBrains Mono"'),
        }));
        setReady(true);
      })
      .catch(e => cancelRender(new Error(`font failed to load: ${e.message || e}`)));
  }, [handle]);
  // Two animation frames after the commit: the mounted frame has been painted by the page itself before the capture asks for one.
  useEffect(() => {
    if (!ready) return undefined;
    let second;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => continueRender(handle)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [ready, handle]);
  return ready;
};
