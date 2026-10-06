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

export const useMotionFonts = () => {
  const [handle] = useState(() => delayRender('loading Motion fonts'));
  useEffect(() => {
    const faces = FACES.map(([family, file, weight]) => new FontFace(family, `url('${staticFile(`fonts/${file}`)}') format('woff2')`, { weight }));
    Promise.all(faces.map(f => f.load()))
      .then(loaded => {
        loaded.forEach(f => document.fonts.add(f));
        console.log('MOTION_FONTS ' + JSON.stringify({
          faces: loaded.map(f => ({ family: f.family, weight: f.weight, status: f.status })),
          check: document.fonts.check('400 32px "JetBrains Mono"'),
        }));
        continueRender(handle);
      })
      .catch(e => cancelRender(new Error(`font failed to load: ${e.message || e}`)));
  }, [handle]);
};
