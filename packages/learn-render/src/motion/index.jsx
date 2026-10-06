// Remotion entry for Motion jobs. `motion-composition` is aliased per job to the validated
// composition source (motion/remotion-renderer.mjs); the harness owns this root, the
// Author only the component and its stage. Fonts come from the package's own woff2 files
// and a failed load cancels the render.
import React from 'react';
import { Composition, registerRoot } from 'remotion';
import Motion, { stage } from 'motion-composition';
import { useMotionFonts } from './fonts.jsx';
import { Probe } from './probe.jsx';

// `probe` (an input prop, off unless the Author proof asks) logs what is visible in each
// rendered frame (motion/author-proof.mjs); it draws nothing.
const Stage = ({ probe }) => {
  useMotionFonts();
  return <><Motion />{probe ? <Probe /> : null}</>;
};

registerRoot(() => <Composition id="motion" component={Stage} defaultProps={{ probe: false }} {...stage} />);
