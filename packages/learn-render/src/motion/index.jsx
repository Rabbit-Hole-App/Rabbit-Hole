// Remotion entry for Motion jobs. `motion-composition` is aliased per job to the validated
// composition source (motion/remotion-renderer.mjs); the harness owns this root, the
// Author only the component and its stage. Fonts come from the package's own woff2 files
// and a failed load cancels the render.
import React from 'react';
import { Composition, registerRoot, useVideoConfig } from 'remotion';
import Motion, { stage } from 'motion-composition';
import { useMotionFonts } from './fonts.jsx';
import { Probe } from './probe.jsx';

// `probe` (an input prop, off unless the Author proof asks) logs what is visible in each
// rendered frame (motion/author-proof.mjs); it draws nothing.
// The stage is clipped to its own size: anything a composition draws or rotates past an edge (it is never in the output) must not
// widen the page's scrollable overflow, which the screenshot's beyond-viewport capture path would otherwise see.
const Clip = ({ children }) => {
  const { width, height } = useVideoConfig();
  return <div style={{ position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden' }}>{children}</div>;
};

const Stage = ({ probe }) => {
  return useMotionFonts() ? <><Clip><Motion /></Clip>{probe ? <Probe /> : null}</> : null;
};

registerRoot(() => <Composition id="motion" component={Stage} defaultProps={{ probe: false }} {...stage} />);
