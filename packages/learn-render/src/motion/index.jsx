// Remotion entry for Motion jobs. `motion-composition` is aliased per job to the validated
// composition source (motion/remotion-renderer.mjs); the harness owns this root, the
// Author only the component and its stage. Fonts come from the package's own woff2 files
// and a failed load cancels the render.
import React from 'react';
import { Composition, registerRoot } from 'remotion';
import Motion, { stage } from 'motion-composition';
import { useMotionFonts } from './fonts.jsx';

const Stage = () => {
  useMotionFonts();
  return <Motion />;
};

registerRoot(() => <Composition id="motion" component={Stage} {...stage} />);
